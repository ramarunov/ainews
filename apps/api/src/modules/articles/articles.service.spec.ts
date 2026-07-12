import { NotFoundException } from '@nestjs/common';
import { ArticleStatus } from '@prisma/client';
import { ArticlesService } from './articles.service';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      article: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      articleRevision: {
        create: jest.fn().mockResolvedValue({}),
      },
      articleTag: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      articleView: { create: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    eventEmitter = { emit: jest.fn() };
    service = new ArticlesService(prisma, eventEmitter);
  });

  describe('create', () => {
    it('slugifies the title, sets revisionCount to 1, and records the first revision', async () => {
      prisma.article.findFirst.mockResolvedValue(null); // no slug collision
      const created = {
        id: 'article-1',
        title: 'Breaking: AI Regulation Bill Passes Senate',
        content: 'Some content here.',
      };
      prisma.article.create.mockResolvedValue(created);

      const result = await service.create(
        { title: 'Breaking: AI Regulation Bill Passes Senate' } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.article.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'breaking-ai-regulation-bill-passes-senate',
            revisionCount: 1,
          }),
        }),
      );
      // Regression test: create() must seed revisionCount to 1 since it also
      // creates revision #1 below — otherwise the first update() recomputes
      // versionNumber 1 again and hits a unique-constraint violation.
      expect(prisma.articleRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ articleId: 'article-1', versionNumber: 1 }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'article.created',
        expect.objectContaining({ articleId: 'article-1', organizationId: 'org-1' }),
      );
      expect(result).toBe(created);
    });

    it('appends a numeric suffix when the generated slug collides with an existing article', async () => {
      prisma.article.findFirst
        .mockResolvedValueOnce({ id: 'other-article' }) // base slug taken
        .mockResolvedValueOnce(null); // base-1 is free
      prisma.article.create.mockResolvedValue({ id: 'article-2', title: 'Hello World', content: '' });

      await service.create({ title: 'Hello World' } as any, 'author-1', 'org-1');

      expect(prisma.article.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'hello-world-1' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when no matching article exists', async () => {
      prisma.article.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-id', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the article when found', async () => {
      const article = { id: 'article-1', title: 'Hello' };
      prisma.article.findFirst.mockResolvedValue(article);

      await expect(service.findOne('article-1', 'org-1')).resolves.toBe(article);
    });
  });

  describe('update', () => {
    const existingArticle = {
      id: 'article-1',
      title: 'Original Title',
      slug: 'original-title',
      content: 'Original content',
      primaryAuthorId: 'author-1',
      authors: [],
      revisionCount: 1,
      publishedAt: null,
    };

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existingArticle as any);
      prisma.article.update.mockImplementation((args: any) =>
        Promise.resolve({ ...existingArticle, ...args.data, id: 'article-1' }),
      );
    });

    it('regenerates the slug when the title changes and no explicit slug is given', async () => {
      prisma.article.findFirst.mockResolvedValue(null); // new slug is free

      await service.update(
        'article-1',
        { title: 'A Brand New Title' } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'a-brand-new-title' }),
        }),
      );
    });

    it('keeps the existing slug when the title is unchanged', async () => {
      await service.update(
        'article-1',
        { excerpt: 'new excerpt' } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'original-title' }),
        }),
      );
      // No slug regeneration means no collision-check query at all.
      expect(prisma.article.findFirst).not.toHaveBeenCalled();
    });

    it('computes the next revision number from the existing revisionCount (regression: must not collide with revision #1 created on insert)', async () => {
      await service.update(
        'article-1',
        { excerpt: 'tweak' } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.articleRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ versionNumber: 2 }) }),
      );
    });

    it('sets publishedAt and emits article.published on the first transition to PUBLISHED', async () => {
      await service.update(
        'article-1',
        { status: ArticleStatus.PUBLISHED } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishedAt: expect.any(Date) }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'article.published',
        expect.objectContaining({ articleId: 'article-1' }),
      );
    });

    it('does not emit article.published for a non-publishing update', async () => {
      await service.update(
        'article-1',
        { excerpt: 'tweak' } as any,
        'author-1',
        'org-1',
      );

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'article.published',
        expect.anything(),
      );
    });

    it('replaces tags by deleting existing ones then creating the new set', async () => {
      await service.update(
        'article-1',
        { tagIds: ['tag-1', 'tag-2'] } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.articleTag.deleteMany).toHaveBeenCalledWith({
        where: { articleId: 'article-1' },
      });
      expect(prisma.articleTag.createMany).toHaveBeenCalledWith({
        data: [
          { articleId: 'article-1', tagId: 'tag-1', sortOrder: 0 },
          { articleId: 'article-1', tagId: 'tag-2', sortOrder: 1 },
        ],
      });
    });

    it('clears tags without recreating any when tagIds is an empty array', async () => {
      await service.update('article-1', { tagIds: [] } as any, 'author-1', 'org-1');

      expect(prisma.articleTag.deleteMany).toHaveBeenCalled();
      expect(prisma.articleTag.createMany).not.toHaveBeenCalled();
    });
  });

  describe('publish / unpublish', () => {
    it('publish() updates status to PUBLISHED', async () => {
      const spy = jest.spyOn(service, 'update').mockResolvedValue({} as any);

      await service.publish('article-1', 'author-1', 'org-1');

      expect(spy).toHaveBeenCalledWith(
        'article-1',
        expect.objectContaining({ status: ArticleStatus.PUBLISHED }),
        'author-1',
        'org-1',
      );
    });

    it('unpublish() updates status to ARCHIVED', async () => {
      const spy = jest.spyOn(service, 'update').mockResolvedValue({} as any);

      await service.unpublish('article-1', 'author-1', 'org-1');

      expect(spy).toHaveBeenCalledWith(
        'article-1',
        expect.objectContaining({ status: ArticleStatus.ARCHIVED }),
        'author-1',
        'org-1',
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of soft-deleting when the article does not exist', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.remove('missing', 'author-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.article.update).not.toHaveBeenCalled();
    });

    it('soft-deletes by setting deletedAt and archiving, then emits article.deleted', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'article-1' } as any);
      prisma.article.update.mockResolvedValue({});

      await service.remove('article-1', 'author-1', 'org-1');

      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: { deletedAt: expect.any(Date), status: ArticleStatus.ARCHIVED },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'article.deleted',
        expect.objectContaining({ articleId: 'article-1' }),
      );
    });
  });

  describe('restore', () => {
    it('clears deletedAt and resets status to DRAFT', async () => {
      prisma.article.update.mockResolvedValue({});

      await service.restore('article-1', 'org-1');

      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1', organizationId: 'org-1' },
        data: { deletedAt: null, status: ArticleStatus.DRAFT },
      });
    });
  });
});
