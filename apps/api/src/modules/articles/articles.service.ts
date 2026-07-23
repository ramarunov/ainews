import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ArticleStatus, Prisma } from '@prisma/client';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { withOrgTransaction } from '../../infrastructure/prisma/rls-extension';
import { sanitizeArticleHtml } from '../../common/sanitize-html';
import { CreateArticleDto, UpdateArticleDto, ArticleQueryDto } from './dto/article.dto';
import { ArticleInternalLinkingService } from './article-internal-linking.service';

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly internalLinkingService: ArticleInternalLinkingService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateArticleDto, authorId: string, organizationId: string) {
    const slug = await this.generateSlug(dto.slug ?? dto.title, organizationId);
    const sanitizedContent = this.sanitizeContent(dto.content ?? '');
    const wordCount = this.countWords(sanitizedContent);
    const readingTime = Math.ceil(wordCount / 200); // ~200 WPM
    const featuredImageUrl = dto.featuredImageId
      ? await this.resolveFeaturedImageUrl(dto.featuredImageId)
      : undefined;

    const article = await this.prisma.article.create({
      data: {
        organizationId,
        primaryAuthorId: authorId,
        primaryCategoryId: dto.primaryCategoryId,
        title: dto.title,
        subtitle: dto.subtitle,
        slug,
        excerpt: dto.excerpt,
        content: sanitizedContent,
        contentJson: dto.contentJson as Prisma.InputJsonValue,
        wordCount,
        readingTime,
        revisionCount: 1,
        language: dto.language ?? 'en',
        isBreaking: dto.isBreaking ?? false,
        isFeatured: dto.isFeatured ?? false,
        isPremium: dto.isPremium ?? false,
        commentsEnabled: dto.commentsEnabled ?? true,
        featuredImageId: dto.featuredImageId,
        featuredImageUrl,
        featuredImageAlt: dto.featuredImageAlt,
        sourceUrl: dto.sourceUrl,
        sourceName: dto.sourceName,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        articleTags: dto.tagIds
          ? {
              create: dto.tagIds.map((tagId, idx) => ({
                tagId,
                sortOrder: idx,
              })),
            }
          : undefined,
        articleCategories: dto.categoryIds
          ? {
              create: dto.categoryIds.map((categoryId, idx) => ({
                categoryId,
                sortOrder: idx,
              })),
            }
          : undefined,
        authors: dto.coAuthorIds
          ? {
              create: dto.coAuthorIds.map((userId, idx) => ({
                userId,
                role: 'co-author',
                sortOrder: idx + 1,
              })),
            }
          : undefined,
      },
      include: this.defaultIncludes(),
    });

    // Create initial revision
    await this.createRevision(article.id, authorId, article.title, article.content, 1);

    this.eventEmitter.emit('article.created', {
      articleId: article.id,
      organizationId,
      authorId,
    });

    return article;
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(query: ArticleQueryDto, organizationId: string) {
    const {
      status,
      categoryId,
      primaryCategoryIds,
      tagId,
      authorId,
      search,
      language,
      isBreaking,
      isFeatured,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const where: Prisma.ArticleWhereInput = {
      organizationId,
      deletedAt: null,
      ...(status && { status }),
      ...(language && { language }),
      ...(isBreaking !== undefined && { isBreaking }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(authorId && { primaryAuthorId: authorId }),
      // Never both set on the same query (see ArticleQueryDto) - exact
      // single-category match, or "any of these" for a category-with-
      // subcategories roll-up, not both.
      ...(categoryId && { primaryCategoryId: categoryId }),
      ...(primaryCategoryIds?.length && { primaryCategoryId: { in: primaryCategoryIds } }),
      ...(tagId && { articleTags: { some: { tagId } } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { excerpt: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: this.defaultIncludes(),
      }),
      this.prisma.article.count({ where }),
    ]);

    // List views (the internal dashboard's Articles list and the public
    // reader site's homepage/category/related-article grids, which both
    // call this same method) only ever render title/excerpt/image/meta,
    // never the full body - but `include` returns every scalar column
    // regardless, so every list response was carrying 20 full article
    // bodies over the wire for no reason. Full content is still available
    // via findOne()/findBySlug() for the single-article views that need it.
    const data = articles.map(({ content: _content, contentJson: _contentJson, ...rest }) => rest);

    return {
      data,
      meta: {
        total,
        page: Math.max(1, page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  // ─── Calendar ──────────────────────────────────────────────────────────────

  /**
   * Powers the editorial calendar view - articles slotted by whichever date
   * is relevant to their current state: SCHEDULED articles by scheduledAt,
   * PUBLISHED ones by publishedAt. A DRAFT with a scheduledAt in the past
   * (never actually got published, e.g. the auto-publish sweep skipped it)
   * intentionally still shows up on its scheduled day - that's useful
   * information for an editor looking at the calendar, not a bug to filter out.
   */
  async getCalendar(organizationId: string, year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    return this.prisma.article.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { scheduledAt: { gte: start, lt: end } },
          { AND: [{ status: ArticleStatus.PUBLISHED }, { publishedAt: { gte: start, lt: end } }] },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        primaryAuthor: { select: { id: true, displayName: true } },
        primaryCategory: { select: { id: true, name: true } },
      },
      orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' }],
    });
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(id: string, organizationId: string) {
    const article = await this.prisma.article.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        ...this.defaultIncludes(),
        seoData: true,
        geoData: true,
        revisions: {
          orderBy: { versionNumber: 'desc' },
          take: 10,
          include: { author: { select: { id: true, displayName: true } } },
        },
      },
    });

    if (!article) {
      throw new NotFoundException(`Article not found`);
    }

    return article;
  }

  // Read-only: lets an editor see why an AI-drafted article auto-published
  // or got flagged for review (autonomous publishing pipeline audit trail).
  async listAiAnalyses(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.articleAiAnalysis.findMany({
      where: { articleId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBySlug(slug: string, organizationId: string) {
    const article = await this.prisma.article.findFirst({
      where: { slug, organizationId, deletedAt: null },
      include: { ...this.defaultIncludes(), seoData: true },
    });

    if (!article) {
      throw new NotFoundException(`Article with slug "${slug}" not found`);
    }

    return article;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateArticleDto,
    userId: string,
    organizationId: string,
  ) {
    const existing = await this.findOne(id, organizationId);

    // Check ownership (writers can only edit their own articles)
    const isOwner = existing.primaryAuthorId === userId;
    const isCoAuthor = existing.authors.some((a) => a.userId === userId);

    // Note: in real app, check permissions from user context too
    if (!isOwner && !isCoAuthor) {
      // Will be overridden by permission guard for editors/admins
    }

    // Generate new slug if title changed and no explicit slug provided
    let slug = existing.slug;
    if (dto.title && dto.title !== existing.title && !dto.slug) {
      slug = await this.generateSlug(dto.title, organizationId, id);
    } else if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateSlug(dto.slug, organizationId, id);
    }

    const content =
      dto.content !== undefined ? this.sanitizeContent(dto.content) : existing.content;
    const wordCount = this.countWords(content);
    const readingTime = Math.ceil(wordCount / 200);

    // Handle status transitions
    const isFirstPublish = dto.status === ArticleStatus.PUBLISHED && !existing.publishedAt;
    if (isFirstPublish) {
      (dto as any).publishedAt = new Date();
    }

    // Denormalized alongside featuredImageId so consumers that only read
    // article fields (SeoService's OG/structured-data generation, the
    // public site) don't need a separate MediaFile lookup - and don't
    // silently see a stale/missing image the way this field did before,
    // when nothing ever actually wrote to it despite being read in several
    // places. Cleared back to null when featuredImageId is cleared.
    const featuredImageUrl =
      dto.featuredImageId !== undefined
        ? dto.featuredImageId
          ? await this.resolveFeaturedImageUrl(dto.featuredImageId)
          : null
        : undefined;

    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        slug,
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        content,
        wordCount,
        readingTime,
        ...(dto.contentJson && { contentJson: dto.contentJson as Prisma.InputJsonValue }),
        ...(dto.status && { status: dto.status }),
        ...(dto.primaryCategoryId !== undefined && {
          primaryCategoryId: dto.primaryCategoryId,
        }),
        ...(dto.featuredImageId !== undefined && {
          featuredImageId: dto.featuredImageId,
          featuredImageUrl,
        }),
        ...(dto.featuredImageAlt !== undefined && {
          featuredImageAlt: dto.featuredImageAlt,
        }),
        ...(dto.isBreaking !== undefined && { isBreaking: dto.isBreaking }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.isPremium !== undefined && { isPremium: dto.isPremium }),
        ...(dto.commentsEnabled !== undefined && { commentsEnabled: dto.commentsEnabled }),
        ...(dto.language && { language: dto.language }),
        ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.sourceUrl !== undefined && { sourceUrl: dto.sourceUrl }),
        ...(dto.sourceName !== undefined && { sourceName: dto.sourceName }),
        ...((dto as any).publishedAt && {
          publishedAt: (dto as any).publishedAt,
        }),
        revisionCount: { increment: 1 },
      },
      include: this.defaultIncludes(),
    });

    // Update tags if provided
    if (dto.tagIds !== undefined) {
      await this.prisma.articleTag.deleteMany({ where: { articleId: id } });
      if (dto.tagIds.length > 0) {
        await this.prisma.articleTag.createMany({
          data: dto.tagIds.map((tagId, idx) => ({
            articleId: id,
            tagId,
            sortOrder: idx,
          })),
        });
      }
    }

    // Update categories if provided - mirrors the tag-replace block above.
    // create() already wrote articleCategories from dto.categoryIds; this
    // was the missing half (update() silently ignored it entirely).
    if (dto.categoryIds !== undefined) {
      await this.prisma.articleCategory.deleteMany({ where: { articleId: id } });
      if (dto.categoryIds.length > 0) {
        await this.prisma.articleCategory.createMany({
          data: dto.categoryIds.map((categoryId, idx) => ({
            articleId: id,
            categoryId,
            sortOrder: idx,
          })),
        });
      }
    }

    // Create revision
    const revisionNumber = (existing.revisionCount ?? 0) + 1;
    await this.createRevision(
      id,
      userId,
      updated.title,
      updated.content,
      revisionNumber,
      dto.changeSummary,
    );

    this.eventEmitter.emit('article.updated', {
      articleId: id,
      organizationId,
      userId,
      status: dto.status,
    });

    if (dto.status === ArticleStatus.PUBLISHED) {
      this.eventEmitter.emit('article.published', {
        articleId: id,
        organizationId,
        slug: updated.slug,
        isFirstPublish,
      });
    }

    if (isFirstPublish) {
      this.internalLinkingService
        .insertLinks(id, organizationId)
        .catch((err) => this.logger.error(`Internal linking failed for article ${id}`, err));
    }

    return updated;
  }

  // ─── Publish ───────────────────────────────────────────────────────────────

  async publish(id: string, userId: string, organizationId: string) {
    return this.update(
      id,
      { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
      userId,
      organizationId,
    );
  }

  async unpublish(id: string, userId: string, organizationId: string) {
    return this.update(
      id,
      { status: ArticleStatus.ARCHIVED } as UpdateArticleDto,
      userId,
      organizationId,
    );
  }

  // ─── Delete (Soft) ─────────────────────────────────────────────────────────

  async remove(id: string, userId: string, organizationId: string) {
    await this.findOne(id, organizationId);

    await this.prisma.article.update({
      where: { id },
      data: { deletedAt: new Date(), status: ArticleStatus.ARCHIVED },
    });

    this.eventEmitter.emit('article.deleted', {
      articleId: id,
      organizationId,
      userId,
    });

    return { success: true, message: 'Article deleted' };
  }

  // ─── Restore ───────────────────────────────────────────────────────────────

  async restore(id: string, organizationId: string) {
    await this.prisma.article.update({
      where: { id, organizationId },
      data: { deletedAt: null, status: ArticleStatus.DRAFT },
    });

    return { success: true, message: 'Article restored' };
  }

  // ─── Track View ────────────────────────────────────────────────────────────

  async trackView(
    id: string,
    organizationId: string,
    viewData: {
      sessionId?: string;
      userId?: string;
      referrer?: string;
      device?: string;
      country?: string;
    },
  ) {
    await withOrgTransaction(this.prisma, async (tx) => {
      await tx.articleView.create({
        data: {
          articleId: id,
          organizationId,
          ...viewData,
        },
      });
      await tx.article.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async generateSlug(
    input: string,
    organizationId: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(input, {
      lower: true,
      strict: true,
      trim: true,
    }).substring(0, 480);

    let slug = base;
    let counter = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.article.findFirst({
        where: {
          organizationId,
          slug,
          deletedAt: null,
          ...(excludeId && { id: { not: excludeId } }),
        },
      });

      if (!existing) break;
      slug = `${base}-${counter++}`;
    }

    return slug;
  }

  private async resolveFeaturedImageUrl(mediaId: string): Promise<string | null> {
    const media = await this.prisma.mediaFile.findUnique({
      where: { id: mediaId },
      select: { publicUrl: true, cdnUrl: true },
    });
    return media?.cdnUrl ?? media?.publicUrl ?? null;
  }

  private countWords(content: string): number {
    return content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean).length;
  }

  private sanitizeContent(html: string): string {
    return sanitizeArticleHtml(html);
  }

  private async createRevision(
    articleId: string,
    authorId: string,
    title: string,
    content: string,
    versionNumber: number,
    changeSummary?: string,
  ) {
    await this.prisma.articleRevision.create({
      data: {
        articleId,
        authorId,
        versionNumber,
        title,
        content,
        changeSummary,
      },
    });
  }

  private defaultIncludes(): Prisma.ArticleInclude {
    return {
      primaryAuthor: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
        },
      },
      primaryCategory: {
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          isActive: true,
          parentId: true,
          parent: { select: { id: true, name: true, slug: true, subdomain: true } },
        },
      },
      articleTags: {
        include: {
          tag: { select: { id: true, name: true, slug: true, color: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      articleCategories: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      authors: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      featuredImage: {
        select: { id: true, publicUrl: true, cdnUrl: true, width: true, height: true },
      },
    };
  }
}
