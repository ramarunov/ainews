/**
 * @jest-environment jsdom
 *
 * TranslationService imports ArticlesService, whose transitive deps
 * (isomorphic-dompurify + the real jsdom package via
 * ArticleInternalLinkingService, plus the openai/anthropic/google SDKs via
 * AIWriterService) need a real `window`, TextEncoder/TextDecoder at import
 * time, and Web Fetch globals - same setup as articles.service.spec.ts.
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

import { ArticleStatus } from '@prisma/client';

import { TranslationService } from './translation.service';

const SOURCE = {
  id: 'src-1',
  organizationId: 'org-1',
  primaryAuthorId: 'author-1',
  primaryCategoryId: 'cat-1',
  title: 'PSSI Panggil 3 Pemain Diaspora',
  subtitle: 'Kejutan di timnas',
  excerpt: 'Federasi mengumumkan pemanggilan.',
  content: '<p>Paragraf.</p>',
  slug: 'pssi-panggil-3-pemain-diaspora',
  featuredImageId: 'img-1',
  featuredImageAlt: 'Foto latihan',
  sourceUrl: 'https://example.com/a',
  sourceName: 'Example',
  commentsEnabled: true,
  language: 'id',
  translationOf: null as string | null,
  articleCategories: [{ categoryId: 'cat-1' }, { categoryId: 'cat-2' }],
  articleTags: [{ tagId: 'tag-1' }],
  translations: [] as Array<{ language: string; slug: string; status: ArticleStatus }>,
};

function build(overrides: {
  source?: Partial<typeof SOURCE> | null;
  enabled?: unknown;
} = {}) {
  const prisma = {
    article: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.source === null ? null : { ...SOURCE, ...(overrides.source ?? {}) },
      ),
      findFirst: jest.fn().mockResolvedValue(
        overrides.source === null ? null : { ...SOURCE, ...(overrides.source ?? {}) },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const aiWriter = {
    translateArticle: jest.fn().mockResolvedValue({
      title: 'PSSI Calls Up 3 Diaspora Players',
      subtitle: 'A shake-up',
      excerpt: 'The federation announced the call-ups.',
      content: '<p>Paragraph.</p>',
    }),
  };
  const articlesService = {
    create: jest.fn().mockResolvedValue({ id: 'en-1', slug: 'pssi-calls-up-3-diaspora-players' }),
    update: jest.fn().mockResolvedValue({ id: 'en-1' }),
  };
  const settings = {
    get: jest.fn().mockResolvedValue(overrides.enabled ?? true),
  };
  const service = new TranslationService(
    prisma as any,
    aiWriter as any,
    articlesService as any,
    settings as any,
  );
  return { service, prisma, aiWriter, articlesService, settings };
}

describe('TranslationService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('onArticlePublished', () => {
    it('does nothing when it is not the first publish', async () => {
      const { service, aiWriter } = build();
      await service.onArticlePublished({ articleId: 'src-1', isFirstPublish: false });
      expect(aiWriter.translateArticle).not.toHaveBeenCalled();
    });

    it('does nothing when the org translation setting is not exactly true', async () => {
      const { service, aiWriter } = build({ enabled: 'true' });
      await service.onArticlePublished({ articleId: 'src-1', isFirstPublish: true });
      expect(aiWriter.translateArticle).not.toHaveBeenCalled();
    });

    it('skips a source that is itself a translation', async () => {
      const { service, aiWriter } = build({ source: { translationOf: 'other' } });
      await service.onArticlePublished({ articleId: 'src-1', isFirstPublish: true });
      expect(aiWriter.translateArticle).not.toHaveBeenCalled();
    });

    it('skips a non-Indonesian source', async () => {
      const { service, aiWriter } = build({ source: { language: 'en' } });
      await service.onArticlePublished({ articleId: 'src-1', isFirstPublish: true });
      expect(aiWriter.translateArticle).not.toHaveBeenCalled();
    });

    it('skips when an English translation already exists', async () => {
      const { service, aiWriter } = build({
        source: { translations: [{ language: 'en', slug: 'x', status: ArticleStatus.DRAFT }] },
      });
      await service.onArticlePublished({ articleId: 'src-1', isFirstPublish: true });
      expect(aiWriter.translateArticle).not.toHaveBeenCalled();
    });

    it('creates an IN_REVIEW English article linked to the source, reusing category/tags/image/byline', async () => {
      const { service, aiWriter, articlesService } = build();

      await service.onArticlePublished({ articleId: 'src-1', isFirstPublish: true });

      expect(aiWriter.translateArticle).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLanguage: 'id', targetLanguage: 'en', articleId: 'src-1' }),
      );

      const [createDto, authorId, orgId] = articlesService.create.mock.calls[0];
      expect(authorId).toBe('author-1');
      expect(orgId).toBe('org-1');
      expect(createDto).toEqual(
        expect.objectContaining({
          title: 'PSSI Calls Up 3 Diaspora Players',
          language: 'en',
          translationOf: 'src-1',
          isAiAssisted: true,
          primaryCategoryId: 'cat-1',
          categoryIds: ['cat-1', 'cat-2'],
          tagIds: ['tag-1'],
          featuredImageId: 'img-1',
        }),
      );

      expect(articlesService.update).toHaveBeenCalledWith(
        'en-1',
        expect.objectContaining({ status: ArticleStatus.IN_REVIEW }),
        'author-1',
        'org-1',
      );
    });

    it('swallows a translation failure without throwing', async () => {
      const { service, aiWriter } = build();
      aiWriter.translateArticle.mockRejectedValue(new Error('provider down'));
      await expect(
        service.onArticlePublished({ articleId: 'src-1', isFirstPublish: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe('translateNow', () => {
    it('throws NotFound when the article does not exist', async () => {
      const { service } = build({ source: null });
      await expect(service.translateNow('missing', 'org-1')).rejects.toThrow('Article not found');
    });

    it('rejects an article that already has an English translation', async () => {
      const { service } = build({
        source: { translations: [{ language: 'en', slug: 'existing-en', status: ArticleStatus.PUBLISHED }] },
      });
      await expect(service.translateNow('src-1', 'org-1')).rejects.toThrow(/already exists/);
    });

    it('rejects a non-Indonesian article', async () => {
      const { service } = build({ source: { language: 'en' } });
      await expect(service.translateNow('src-1', 'org-1')).rejects.toThrow(/Only id articles/);
    });

    it('ignores the org enabled flag and returns the created id/slug', async () => {
      const { service, aiWriter } = build({ enabled: false });
      const result = await service.translateNow('src-1', 'org-1');
      expect(aiWriter.translateArticle).toHaveBeenCalled();
      expect(result).toEqual({ id: 'en-1', slug: 'pssi-calls-up-3-diaspora-players' });
    });
  });

  describe('approvePending', () => {
    it('publishes every pending translation and keeps going past a failure', async () => {
      const { service, prisma, articlesService } = build();
      prisma.article.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
      articlesService.update
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({});

      const result = await service.approvePending('org-1', 'user-1');

      expect(result).toEqual({ pending: 3, published: 2 });
      expect(articlesService.update).toHaveBeenCalledTimes(3);
      expect(articlesService.update).toHaveBeenLastCalledWith(
        'c',
        expect.objectContaining({ status: ArticleStatus.PUBLISHED }),
        'user-1',
        'org-1',
      );
    });
  });
});
