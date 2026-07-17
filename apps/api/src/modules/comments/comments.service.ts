import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { withOrgTransaction } from '../../infrastructure/prisma/rls-extension';
import { PublicSiteService } from '../public-site/public-site.service';
import { SubmitCommentDto, CommentQueryDto } from './dto/comment.dto';
import { containsLink, computeSpamScore, isLikelySpam } from './comment-spam-filter.util';

export interface CommentTreeNode {
  id: string;
  authorName: string;
  content: string;
  createdAt: Date;
  replies: CommentTreeNode[];
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicSiteService: PublicSiteService,
  ) {}

  // ─── Public: submit + list (approved only) ─────────────────────────────────

  async submitComment(slug: string, dto: SubmitCommentDto, ipAddress?: string) {
    const organizationId = this.publicSiteService.getPublicOrgId();
    // findPublishedBySlug() already 404s for a draft/missing article - a
    // guessable slug for an unpublished article must never let someone
    // attach a comment to it (and never leak that the slug exists at all).
    const article = await this.publicSiteService.findPublishedBySlug(slug);

    if (dto.parentId) {
      const parent = await this.prisma.articleComment.findFirst({
        where: { id: dto.parentId, articleId: article.id, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Komentar yang Anda balas sudah tidak ada.');
      }
    }

    // Hard reject rather than silently strip - a spam bot resubmitting
    // without the link doesn't cost us anything, and stripping would let a
    // link-shaped payload through as garbled text instead of just failing
    // clearly. Checked separately from computeSpamScore() so this specific,
    // explicit reason always surfaces to the submitter rather than a vague
    // "spam" rejection.
    if (containsLink(dto.content)) {
      throw new BadRequestException('Komentar tidak boleh berisi tautan/link.');
    }

    const spamScore = computeSpamScore(dto.content, dto.authorName);
    const status = isLikelySpam(dto.content, dto.authorName)
      ? CommentStatus.SPAM
      : CommentStatus.PENDING;

    const comment = await this.prisma.articleComment.create({
      data: {
        organizationId,
        articleId: article.id,
        parentId: dto.parentId,
        authorName: dto.authorName,
        authorEmail: dto.authorEmail,
        content: dto.content,
        status,
        spamScore,
        ipAddress,
      },
    });

    return {
      id: comment.id,
      status: comment.status,
      message:
        comment.status === CommentStatus.SPAM
          ? 'Komentar Anda ditandai dan perlu ditinjau manual sebelum dapat tampil.'
          : 'Komentar Anda telah dikirim dan akan tampil setelah disetujui moderator.',
    };
  }

  async listApprovedComments(slug: string): Promise<CommentTreeNode[]> {
    const article = await this.publicSiteService.findPublishedBySlug(slug);

    const rows = await this.prisma.articleComment.findMany({
      where: { articleId: article.id, status: CommentStatus.APPROVED, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, parentId: true, authorName: true, content: true, createdAt: true },
    });

    return buildCommentTree(rows);
  }

  // ─── Moderation (authenticated, comments:read / comments:moderate) ─────────

  async listForModeration(organizationId: string, query: CommentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ArticleCommentWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.articleComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { article: { select: { id: true, title: true, slug: true } } },
      }),
      this.prisma.articleComment.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async moderate(id: string, status: CommentStatus, organizationId: string) {
    const existing = await this.prisma.articleComment.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Comment not found');

    const wasApproved = existing.status === CommentStatus.APPROVED;
    const willBeApproved = status === CommentStatus.APPROVED;

    return withOrgTransaction(this.prisma, async (tx) => {
      const updated = await tx.articleComment.update({ where: { id }, data: { status } });

      if (wasApproved !== willBeApproved) {
        await tx.article.update({
          where: { id: existing.articleId },
          data: { commentCount: { increment: willBeApproved ? 1 : -1 } },
        });
      }

      return updated;
    });
  }

  async remove(id: string, organizationId: string) {
    const existing = await this.prisma.articleComment.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Comment not found');

    return withOrgTransaction(this.prisma, async (tx) => {
      const removed = await tx.articleComment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      if (existing.status === CommentStatus.APPROVED) {
        await tx.article.update({
          where: { id: existing.articleId },
          data: { commentCount: { decrement: 1 } },
        });
      }

      return removed;
    });
  }
}

// Comments are fetched flat (one query, ordered oldest-first) and nested
// here rather than with a recursive Prisma query - the moderation-approved
// set for a single article is small, and this keeps the DB side simple.
function buildCommentTree(
  rows: { id: string; parentId: string | null; authorName: string; content: string; createdAt: Date }[],
): CommentTreeNode[] {
  const nodes = new Map<string, CommentTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, { id: row.id, authorName: row.authorName, content: row.content, createdAt: row.createdAt, replies: [] });
  }

  const roots: CommentTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parentId && nodes.has(row.parentId)) {
      nodes.get(row.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
