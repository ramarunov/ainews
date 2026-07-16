/**
 * @jest-environment jsdom
 *
 * articles.service.ts imports isomorphic-dompurify, which requires a real
 * `window` (via jsdom) when running outside a browser. The rest of this
 * suite (and the rest of the backend's tests) run under the default `node`
 * environment; this override is scoped to this one file only.
 *
 * It also now transitively imports the real jsdom *package* (via
 * ArticleInternalLinkingService), which needs TextEncoder/TextDecoder at
 * import time via whatwg-url - jest's jsdom test environment doesn't
 * provide those, so they must be polyfilled before that import happens.
 *
 * ArticleInternalLinkingService also pulls in AIWriterService ->
 * AIGatewayService -> the real openai/@anthropic-ai/sdk/@google/generative-ai
 * SDKs, which probe for Web Fetch API globals at module load time even when
 * mocked (see ai-gateway.service.spec.ts for the same requirement).
 */
import { TextEncoder, TextDecoder } from 'node:util';

(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

jest.mock('openai');
jest.mock('@anthropic-ai/sdk');
jest.mock('@google/generative-ai');
for (const name of ['fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'ReadableStream']) {
  (global as any)[name] = (global as any)[name] || class {};
}

import { NotFoundException } from '@nestjs/common';
import { ArticleStatus } from '@prisma/client';
import { ArticlesService } from './articles.service';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let prisma: any;
  let eventEmitter: any;
  let internalLinkingService: any;

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
      articleCategory: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      articleView: { create: jest.fn() },
      mediaFile: { findUnique: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    eventEmitter = { emit: jest.fn() };
    internalLinkingService = { insertLinks: jest.fn().mockResolvedValue(undefined) };
    service = new ArticlesService(prisma, eventEmitter, internalLinkingService);
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

    it('denormalizes featuredImageUrl from the MediaFile when featuredImageId is given', async () => {
      prisma.article.findFirst.mockResolvedValue(null);
      prisma.mediaFile.findUnique.mockResolvedValue({
        publicUrl: 'https://cdn/photo.png',
        cdnUrl: null,
      });
      prisma.article.create.mockResolvedValue({ id: 'article-img', title: 'X', content: '' });

      await service.create(
        { title: 'X', featuredImageId: 'media-1' } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.mediaFile.findUnique).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        select: { publicUrl: true, cdnUrl: true },
      });
      expect(prisma.article.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ featuredImageUrl: 'https://cdn/photo.png' }),
        }),
      );
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

    it('strips <script> tags and event-handler attributes from content before storing', async () => {
      prisma.article.findFirst.mockResolvedValue(null);
      prisma.article.create.mockResolvedValue({ id: 'article-3', title: 'Safe Title', content: '' });

      await service.create(
        {
          title: 'Safe Title',
          content:
            '<p>Hello <img src="x.png" onerror="alert(1)">world</p><script>alert(document.cookie)</script>',
        } as any,
        'author-1',
        'org-1',
      );

      const storedContent = prisma.article.create.mock.calls[0][0].data.content;
      expect(storedContent).not.toContain('<script');
      expect(storedContent).not.toContain('onerror');
      expect(storedContent).toContain('<p>Hello');
      expect(storedContent).toContain('<img src="x.png"');
    });

    it('preserves ordinary formatting HTML unchanged', async () => {
      prisma.article.findFirst.mockResolvedValue(null);
      prisma.article.create.mockResolvedValue({ id: 'article-4', title: 'Formatted', content: '' });
      const formatted =
        '<h2>Heading</h2><p>Some <strong>bold</strong> and <a href="https://example.com">a link</a>.</p><ul><li>one</li></ul>';

      await service.create({ title: 'Formatted', content: formatted } as any, 'author-1', 'org-1');

      const storedContent = prisma.article.create.mock.calls[0][0].data.content;
      expect(storedContent).toBe(formatted);
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

    it('re-resolves featuredImageUrl from the new MediaFile when featuredImageId changes', async () => {
      prisma.mediaFile.findUnique.mockResolvedValue({ publicUrl: null, cdnUrl: 'https://cdn.example/photo.png' });

      await service.update(
        'article-1',
        { featuredImageId: 'media-2' } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.mediaFile.findUnique).toHaveBeenCalledWith({
        where: { id: 'media-2' },
        select: { publicUrl: true, cdnUrl: true },
      });
      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            featuredImageId: 'media-2',
            featuredImageUrl: 'https://cdn.example/photo.png',
          }),
        }),
      );
    });

    it('clears featuredImageUrl back to null when featuredImageId is cleared', async () => {
      await service.update(
        'article-1',
        { featuredImageId: null } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.mediaFile.findUnique).not.toHaveBeenCalled();
      expect(prisma.article.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ featuredImageId: null, featuredImageUrl: null }),
        }),
      );
    });

    it('leaves featuredImageUrl untouched when featuredImageId is not part of the update', async () => {
      await service.update(
        'article-1',
        { excerpt: 'new excerpt' } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.mediaFile.findUnique).not.toHaveBeenCalled();
      expect(prisma.article.update.mock.calls[0][0].data).not.toHaveProperty('featuredImageUrl');
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

    it('triggers internal-link insertion on the first transition to PUBLISHED', async () => {
      await service.update(
        'article-1',
        { status: ArticleStatus.PUBLISHED } as any,
        'author-1',
        'org-1',
      );

      expect(internalLinkingService.insertLinks).toHaveBeenCalledWith('article-1', 'org-1');
    });

    it('does not trigger internal-link insertion when republishing an already-published article', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...existingArticle,
        publishedAt: new Date('2026-01-01'),
      } as any);

      await service.update(
        'article-1',
        { status: ArticleStatus.PUBLISHED } as any,
        'author-1',
        'org-1',
      );

      expect(internalLinkingService.insertLinks).not.toHaveBeenCalled();
    });

    it('does not trigger internal-link insertion for a non-publishing update', async () => {
      await service.update(
        'article-1',
        { excerpt: 'tweak' } as any,
        'author-1',
        'org-1',
      );

      expect(internalLinkingService.insertLinks).not.toHaveBeenCalled();
    });

    it('a rejected internal-linking promise is caught and logged, never thrown from update()', async () => {
      internalLinkingService.insertLinks.mockRejectedValue(new Error('AI gateway down'));

      await expect(
        service.update('article-1', { status: ArticleStatus.PUBLISHED } as any, 'author-1', 'org-1'),
      ).resolves.toBeDefined();
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

    it('replaces categories by deleting existing ones then creating the new set', async () => {
      await service.update(
        'article-1',
        { categoryIds: ['cat-1', 'cat-2'] } as any,
        'author-1',
        'org-1',
      );

      expect(prisma.articleCategory.deleteMany).toHaveBeenCalledWith({
        where: { articleId: 'article-1' },
      });
      expect(prisma.articleCategory.createMany).toHaveBeenCalledWith({
        data: [
          { articleId: 'article-1', categoryId: 'cat-1', sortOrder: 0 },
          { articleId: 'article-1', categoryId: 'cat-2', sortOrder: 1 },
        ],
      });
    });

    it('clears categories without recreating any when categoryIds is an empty array', async () => {
      await service.update('article-1', { categoryIds: [] } as any, 'author-1', 'org-1');

      expect(prisma.articleCategory.deleteMany).toHaveBeenCalled();
      expect(prisma.articleCategory.createMany).not.toHaveBeenCalled();
    });

    it('does not touch categories at all when categoryIds is not provided', async () => {
      await service.update('article-1', { excerpt: 'tweak' } as any, 'author-1', 'org-1');

      expect(prisma.articleCategory.deleteMany).not.toHaveBeenCalled();
      expect(prisma.articleCategory.createMany).not.toHaveBeenCalled();
    });

    it('sanitizes new content on update, but leaves already-stored content alone when not provided', async () => {
      await service.update(
        'article-1',
        { content: '<p>ok</p><script>alert(1)</script>' } as any,
        'author-1',
        'org-1',
      );
      const firstCallContent = prisma.article.update.mock.calls[0][0].data.content;
      expect(firstCallContent).toBe('<p>ok</p>');

      prisma.article.update.mockClear();
      await service.update('article-1', { excerpt: 'no content field here' } as any, 'author-1', 'org-1');
      const secondCallContent = prisma.article.update.mock.calls[0][0].data.content;
      expect(secondCallContent).toBe(existingArticle.content); // untouched, not re-sanitized
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
