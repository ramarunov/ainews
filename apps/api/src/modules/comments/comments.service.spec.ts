/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 *
 * CommentsService -> PublicSiteService -> ArticlesService -> sanitize-html
 * -> isomorphic-dompurify, which needs a real `window` even though this
 * spec never exercises that code path. See articles.service.spec.ts /
 * news-intelligence.service.spec.ts for the same requirement.
 */
import { TextEncoder, TextDecoder } from 'node:util';
import { setImmediate } from 'node:timers';

(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;
// PublicSiteService also transitively imports SearchService ->
// @opensearch-project/opensearch, which needs Node's setImmediate - jsdom's
// test environment doesn't provide one either.
(global as any).setImmediate = (global as any).setImmediate || setImmediate;

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommentStatus } from '@prisma/client';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: any;
  let publicSiteService: any;

  const article = { id: 'article-1', slug: 'some-story', status: 'PUBLISHED' };

  beforeEach(() => {
    prisma = {
      articleComment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      article: {
        update: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    publicSiteService = {
      getPublicOrgId: jest.fn().mockReturnValue('org-1'),
      findPublishedBySlug: jest.fn().mockResolvedValue(article),
    };
    service = new CommentsService(prisma, publicSiteService);
  });

  describe('submitComment', () => {
    const baseDto = { authorName: 'Jane Reader', authorEmail: 'jane@example.com', content: 'Great story!' };

    it('rejects content containing a link before ever touching the DB', async () => {
      await expect(
        service.submitComment('some-story', { ...baseDto, content: 'check https://spam.example' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.articleComment.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING comment for ordinary content', async () => {
      prisma.articleComment.create.mockResolvedValue({ id: 'c-1', status: CommentStatus.PENDING });

      const result = await service.submitComment('some-story', baseDto);

      expect(prisma.articleComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            articleId: 'article-1',
            status: CommentStatus.PENDING,
          }),
        }),
      );
      expect(result.status).toBe(CommentStatus.PENDING);
    });

    it('auto-flags obviously spammy content as SPAM instead of PENDING', async () => {
      prisma.articleComment.create.mockResolvedValue({ id: 'c-2', status: CommentStatus.SPAM });

      const result = await service.submitComment('some-story', {
        ...baseDto,
        content: 'CHEAP VIAGRA AND CASINO DEALS CLICK HERE NOW!!!!',
      });

      expect(prisma.articleComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CommentStatus.SPAM }) }),
      );
      expect(result.status).toBe(CommentStatus.SPAM);
    });

    it('rejects a reply whose parentId does not belong to this article', async () => {
      prisma.articleComment.findFirst.mockResolvedValue(null);

      await expect(
        service.submitComment('some-story', { ...baseDto, parentId: 'nonexistent' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.articleComment.create).not.toHaveBeenCalled();
    });

    it('accepts a reply whose parentId is a real comment on the same article', async () => {
      prisma.articleComment.findFirst.mockResolvedValue({ id: 'parent-1', articleId: 'article-1' });
      prisma.articleComment.create.mockResolvedValue({ id: 'c-3', status: CommentStatus.PENDING });

      await service.submitComment('some-story', { ...baseDto, parentId: 'parent-1' });

      expect(prisma.articleComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ parentId: 'parent-1' }) }),
      );
    });
  });

  describe('listApprovedComments', () => {
    it('nests replies under their parent, preserving chronological order within each level', async () => {
      prisma.articleComment.findMany.mockResolvedValue([
        { id: 'a', parentId: null, authorName: 'A', content: 'top', createdAt: new Date('2026-01-01') },
        { id: 'b', parentId: 'a', authorName: 'B', content: 'reply to a', createdAt: new Date('2026-01-02') },
        { id: 'c', parentId: null, authorName: 'C', content: 'another top', createdAt: new Date('2026-01-03') },
        { id: 'd', parentId: 'b', authorName: 'D', content: 'reply to reply', createdAt: new Date('2026-01-04') },
      ]);

      const tree = await service.listApprovedComments('some-story');

      expect(tree).toHaveLength(2);
      expect(tree[0].id).toBe('a');
      expect(tree[0].replies[0].id).toBe('b');
      expect(tree[0].replies[0].replies[0].id).toBe('d');
      expect(tree[1].id).toBe('c');
    });

    it('only queries APPROVED, non-deleted comments for the resolved article', async () => {
      prisma.articleComment.findMany.mockResolvedValue([]);

      await service.listApprovedComments('some-story');

      expect(prisma.articleComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { articleId: 'article-1', status: CommentStatus.APPROVED, deletedAt: null },
        }),
      );
    });
  });

  describe('moderate', () => {
    it('throws NotFoundException for a comment outside this org', async () => {
      prisma.articleComment.findFirst.mockResolvedValue(null);

      await expect(service.moderate('c-1', CommentStatus.APPROVED, 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('increments Article.commentCount when approving a previously-pending comment', async () => {
      prisma.articleComment.findFirst.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
        articleId: 'article-1',
        status: CommentStatus.PENDING,
      });
      prisma.articleComment.update.mockResolvedValue({ id: 'c-1', status: CommentStatus.APPROVED });

      await service.moderate('c-1', CommentStatus.APPROVED, 'org-1');

      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: { commentCount: { increment: 1 } },
      });
    });

    it('decrements Article.commentCount when un-approving a previously-approved comment', async () => {
      prisma.articleComment.findFirst.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
        articleId: 'article-1',
        status: CommentStatus.APPROVED,
      });
      prisma.articleComment.update.mockResolvedValue({ id: 'c-1', status: CommentStatus.REJECTED });

      await service.moderate('c-1', CommentStatus.REJECTED, 'org-1');

      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: { commentCount: { increment: -1 } },
      });
    });

    it('does not touch Article.commentCount when the approved-ness does not change', async () => {
      prisma.articleComment.findFirst.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
        articleId: 'article-1',
        status: CommentStatus.PENDING,
      });
      prisma.articleComment.update.mockResolvedValue({ id: 'c-1', status: CommentStatus.SPAM });

      await service.moderate('c-1', CommentStatus.SPAM, 'org-1');

      expect(prisma.article.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes and decrements commentCount when the comment was approved', async () => {
      prisma.articleComment.findFirst.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
        articleId: 'article-1',
        status: CommentStatus.APPROVED,
      });
      prisma.articleComment.update.mockResolvedValue({ id: 'c-1', deletedAt: new Date() });

      await service.remove('c-1', 'org-1');

      expect(prisma.articleComment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1' }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: { commentCount: { decrement: 1 } },
      });
    });

    it('does not touch commentCount when deleting a non-approved comment', async () => {
      prisma.articleComment.findFirst.mockResolvedValue({
        id: 'c-1',
        organizationId: 'org-1',
        articleId: 'article-1',
        status: CommentStatus.PENDING,
      });
      prisma.articleComment.update.mockResolvedValue({ id: 'c-1', deletedAt: new Date() });

      await service.remove('c-1', 'org-1');

      expect(prisma.article.update).not.toHaveBeenCalled();
    });
  });
});
