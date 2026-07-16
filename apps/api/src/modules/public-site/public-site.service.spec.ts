/**
 * @jest-environment jsdom
 *
 * public-site.service.ts imports ArticlesService, which imports
 * isomorphic-dompurify — that package needs a real `window` (via jsdom)
 * even when unused by the code path under test here. See
 * articles.service.spec.ts for the same requirement and its own note.
 *
 * ArticlesService also now transitively imports the real jsdom *package*
 * (via ArticleInternalLinkingService) and the openai/@anthropic-ai/sdk/
 * @google/generative-ai SDKs (via AIWriterService) — same TextEncoder and
 * Web Fetch API stubs as articles.service.spec.ts / ai-gateway.service.spec.ts.
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

// jsdom doesn't polyfill Node's setImmediate, which
// @opensearch-project/opensearch's helpers reference at import time —
// transitively pulled in here via SearchService. Must run before that
// import below.
(global as any).setImmediate = (global as any).setImmediate || setTimeout;

import { NotFoundException } from '@nestjs/common';
import { PublicSiteService } from './public-site.service';

describe('PublicSiteService', () => {
  let service: PublicSiteService;
  let prisma: any;
  let articlesService: any;
  let categoriesService: any;
  let searchService: any;
  let settingsService: any;
  let config: any;

  beforeEach(() => {
    prisma = { user: { findFirst: jest.fn() } };
    articlesService = {
      findAll: jest.fn(),
      findBySlug: jest.fn(),
    };
    categoriesService = {
      findAll: jest.fn(),
      findBySlug: jest.fn(),
    };
    searchService = { search: jest.fn() };
    settingsService = { list: jest.fn() };
    config = { get: jest.fn().mockReturnValue('org-1') };
    service = new PublicSiteService(
      prisma,
      articlesService,
      categoriesService,
      searchService,
      settingsService,
      config,
    );
  });

  describe('listPublished', () => {
    it('throws NotFoundException when no public org is configured', async () => {
      config.get.mockReturnValue('');

      await expect(service.listPublished({})).rejects.toThrow(NotFoundException);
      expect(articlesService.findAll).not.toHaveBeenCalled();
    });

    it('always forces status=PUBLISHED regardless of what the caller asks for', async () => {
      articlesService.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.listPublished({ page: 2 } as any);

      expect(articlesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PUBLISHED', page: 2 }),
        'org-1',
      );
    });

    it('resolves categorySlug to a categoryId before querying articles', async () => {
      categoriesService.findBySlug.mockResolvedValue({ id: 'cat-1', slug: 'world' });
      articlesService.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.listPublished({ categorySlug: 'world' } as any);

      expect(categoriesService.findBySlug).toHaveBeenCalledWith('world', 'org-1');
      expect(articlesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-1' }),
        'org-1',
      );
    });

    it('fetches one extra item and filters out excludeId, for related-articles queries', async () => {
      articlesService.findAll.mockResolvedValue({
        data: [{ id: 'current' }, { id: 'a' }, { id: 'b' }],
        meta: { total: 3 },
      });

      const result = await service.listPublished({ excludeId: 'current', limit: 2 } as any);

      expect(articlesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 3 }),
        'org-1',
      );
      expect(result.data).toEqual([{ id: 'a' }, { id: 'b' }]);
    });
  });

  describe('findPublishedBySlug', () => {
    it('throws NotFoundException for a draft article even though it exists', async () => {
      articlesService.findBySlug.mockResolvedValue({ id: 'a1', status: 'DRAFT', slug: 'x' });

      await expect(service.findPublishedBySlug('x')).rejects.toThrow(NotFoundException);
    });

    it('returns a published article', async () => {
      const article = { id: 'a1', status: 'PUBLISHED', slug: 'x' };
      articlesService.findBySlug.mockResolvedValue(article);

      await expect(service.findPublishedBySlug('x')).resolves.toBe(article);
      expect(articlesService.findBySlug).toHaveBeenCalledWith('x', 'org-1');
    });
  });

  describe('listCategories', () => {
    it('delegates to CategoriesService.findAll with flat:true, scoped to the public org', async () => {
      categoriesService.findAll.mockResolvedValue({ data: [{ id: 'cat-1' }] });

      const result = await service.listCategories();

      expect(categoriesService.findAll).toHaveBeenCalledWith(
        { flat: true, limit: 100 },
        'org-1',
      );
      expect(result).toEqual([{ id: 'cat-1' }]);
    });
  });

  describe('getAuthorProfile', () => {
    it('throws NotFoundException when the user does not exist in the public org', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getAuthorProfile('user-1')).rejects.toThrow(NotFoundException);
    });

    it('returns only public-safe fields for an active user in the public org', async () => {
      const author = { id: 'user-1', displayName: 'Jane Doe', avatarUrl: null, bio: 'Reporter' };
      prisma.user.findFirst.mockResolvedValue(author);

      const result = await service.getAuthorProfile('user-1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'user-1',
            organizationId: 'org-1',
            deletedAt: null,
            isActive: true,
          }),
        }),
      );
      expect(result).toBe(author);
    });
  });

  describe('search', () => {
    it('scopes search to the public org and forces status=PUBLISHED', async () => {
      searchService.search.mockResolvedValue({ data: [], meta: {} });

      await service.search('ai regulation', 1, 20);

      expect(searchService.search).toHaveBeenCalledWith(
        'ai regulation',
        'org-1',
        { status: 'PUBLISHED' },
        1,
        20,
      );
    });
  });

  describe('getPublicSettings', () => {
    it('only returns settings marked isPublic, scoped to the public org', async () => {
      settingsService.list.mockResolvedValue([{ key: 'ads.header', isPublic: true }]);

      await service.getPublicSettings();

      expect(settingsService.list).toHaveBeenCalledWith('org-1', true);
    });
  });
});
