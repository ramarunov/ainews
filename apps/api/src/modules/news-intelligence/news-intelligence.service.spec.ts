/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 *
 * NewsIntelligenceService imports common/sanitize-html -> isomorphic-dompurify,
 * which needs a real `window` (via jsdom) even when unused by the code path
 * under test here. See articles.service.spec.ts for the same requirement.
 * The customExportConditions override keeps package "exports" resolution on
 * the node path — jsdom's default ("browser") makes @nestjs/bull's chain
 * (bull -> ioredis -> msgpackr) resolve to an ESM build ts-jest can't parse.
 */
import { TextEncoder, TextDecoder } from 'node:util';

// jsdom's test environment doesn't provide TextEncoder/TextDecoder, which
// the jsdom *package* (pulled in transitively via ArticleExtractionService)
// needs at import time via whatwg-url. Must run before that import.
(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NewsIntelligenceService } from './news-intelligence.service';

describe('NewsIntelligenceService', () => {
  let service: NewsIntelligenceService;
  let prisma: any;
  let eventEmitter: any;
  let queue: any;
  let clusteringService: any;
  let extractionService: any;
  let categoriesService: any;

  beforeEach(() => {
    prisma = {
      newsSource: { findFirst: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };
    queue = { add: jest.fn() };
    clusteringService = { processItem: jest.fn().mockResolvedValue(undefined) };
    extractionService = {
      isLikelyTruncated: jest.fn().mockReturnValue(false),
      extractFromUrl: jest.fn().mockResolvedValue(null),
    };
    categoriesService = { resolveByHint: jest.fn().mockResolvedValue(null) };
    service = new NewsIntelligenceService(
      prisma,
      eventEmitter,
      clusteringService,
      extractionService,
      categoriesService,
      queue,
    );
  });

  describe('enqueueAndAwaitIngest', () => {
    it('throws NotFoundException immediately for a source outside this org, without touching the queue', async () => {
      prisma.newsSource.findFirst.mockResolvedValue(null);

      await expect(
        service.enqueueAndAwaitIngest('src-1', 'org-1'),
      ).rejects.toThrow(NotFoundException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('enqueues the job and returns whatever the processor resolves with', async () => {
      prisma.newsSource.findFirst.mockResolvedValue({ id: 'src-1', organizationId: 'org-1' });
      const jobResult = { itemsFound: 3, itemsCreated: 2, itemsSkipped: 1 };
      queue.add.mockResolvedValue({ finished: jest.fn().mockResolvedValue(jobResult) });

      const result = await service.enqueueAndAwaitIngest('src-1', 'org-1');

      expect(queue.add).toHaveBeenCalledWith('ingest-source', {
        sourceId: 'src-1',
        organizationId: 'org-1',
      });
      expect(result).toBe(jobResult);
    });

    it('re-wraps a job failure as BadRequestException, since class identity is lost through the queue', async () => {
      prisma.newsSource.findFirst.mockResolvedValue({ id: 'src-1', organizationId: 'org-1' });
      queue.add.mockResolvedValue({
        finished: jest.fn().mockRejectedValue(new Error('feed 500')),
      });

      await expect(service.enqueueAndAwaitIngest('src-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createDraftFromItem', () => {
    beforeEach(() => {
      prisma.newsItem = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          organizationId: 'org-1',
          articleId: null,
          title: 'Some headline',
          excerpt: 'An excerpt',
          content: '<p>Body</p>',
          url: 'https://source.example/a',
          sourceName: 'Example Source',
          language: 'en',
          category: 'Politik',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };
      prisma.article = {
        findFirst: jest.fn().mockResolvedValue(null), // slug is unique on first try
        create: jest.fn().mockResolvedValue({ id: 'article-1' }),
      };
    });

    it('resolves the news item\'s category hint to a real category and sets it on the draft', async () => {
      categoriesService.resolveByHint.mockResolvedValue('cat-politik-id');

      await service.createDraftFromItem('item-1', 'user-1', 'org-1');

      expect(categoriesService.resolveByHint).toHaveBeenCalledWith('Politik', 'org-1');
      expect(prisma.article.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ primaryCategoryId: 'cat-politik-id' }),
        }),
      );
    });

    it('leaves the draft uncategorized when the hint matches no current category', async () => {
      categoriesService.resolveByHint.mockResolvedValue(null);

      await service.createDraftFromItem('item-1', 'user-1', 'org-1');

      expect(prisma.article.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ primaryCategoryId: null }),
        }),
      );
    });
  });
});
