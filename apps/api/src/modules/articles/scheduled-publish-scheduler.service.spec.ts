/** @jest-environment jsdom */
// jsdom, not the default node environment: this file transitively imports
// ArticlesService, which imports isomorphic-dompurify — that package
// needs a real `window` (see articles.service.spec.ts for the full story).
//
// ArticlesService also now transitively imports the real jsdom *package*
// (via ArticleInternalLinkingService) and the openai/@anthropic-ai/sdk/
// @google/generative-ai SDKs (via AIWriterService) — same stubs as
// articles.service.spec.ts / ai-gateway.service.spec.ts.
import { TextEncoder, TextDecoder } from 'node:util';

(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

jest.mock('openai');
jest.mock('@anthropic-ai/sdk');
jest.mock('@google/generative-ai');
for (const name of ['fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'ReadableStream']) {
  (global as any)[name] = (global as any)[name] || class {};
}

import { ScheduledPublishSchedulerService } from './scheduled-publish-scheduler.service';

describe('ScheduledPublishSchedulerService', () => {
  let service: ScheduledPublishSchedulerService;
  let prisma: any;
  let articlesService: any;
  let notificationsService: any;
  let schedulerRegistry: any;
  let config: any;

  beforeEach(() => {
    prisma = {
      organization: { findMany: jest.fn() },
      article: { findMany: jest.fn() },
    };
    articlesService = { publish: jest.fn() };
    notificationsService = { create: jest.fn().mockResolvedValue({}) };
    schedulerRegistry = { addInterval: jest.fn() };
    config = { get: jest.fn((_key: string, fallback: any) => fallback) };
    service = new ScheduledPublishSchedulerService(
      schedulerRegistry,
      config,
      prisma,
      articlesService,
      notificationsService,
    );
  });

  describe('onModuleInit', () => {
    it('registers a named interval with the scheduler registry', () => {
      service.onModuleInit();

      expect(schedulerRegistry.addInterval).toHaveBeenCalledWith(
        'scheduled-publish-sweep',
        expect.anything(),
      );

      clearInterval(schedulerRegistry.addInterval.mock.calls[0][1]);
    });
  });

  describe('publishDueArticles', () => {
    it('publishes every SCHEDULED article whose scheduledAt has passed, scoped per organization', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
      prisma.article.findMany
        .mockResolvedValueOnce([{ id: 'article-1', primaryAuthorId: 'author-1' }])
        .mockResolvedValueOnce([{ id: 'article-2', primaryAuthorId: 'author-2' }]);
      articlesService.publish.mockResolvedValue({});

      const published = await service.publishDueArticles();

      expect(published).toBe(2);
      expect(articlesService.publish).toHaveBeenCalledWith('article-1', 'author-1', 'org-1');
      expect(articlesService.publish).toHaveBeenCalledWith('article-2', 'author-2', 'org-2');
    });

    it('only queries SCHEDULED, non-deleted articles whose scheduledAt has already passed', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.article.findMany.mockResolvedValue([]);

      await service.publishDueArticles();

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'SCHEDULED',
            deletedAt: null,
            scheduledAt: { lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('does not let one article failing to publish stop the rest from being processed', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.article.findMany.mockResolvedValue([
        { id: 'article-1', primaryAuthorId: 'author-1' },
        { id: 'article-2', primaryAuthorId: 'author-2' },
      ]);
      articlesService.publish
        .mockRejectedValueOnce(new Error('DB hiccup'))
        .mockResolvedValueOnce({});

      const published = await service.publishDueArticles();

      expect(published).toBe(1);
      expect(articlesService.publish).toHaveBeenCalledTimes(2);
    });

    it('returns 0 and publishes nothing when no articles are due', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.article.findMany.mockResolvedValue([]);

      const published = await service.publishDueArticles();

      expect(published).toBe(0);
      expect(articlesService.publish).not.toHaveBeenCalled();
    });

    it("notifies the article's author once their scheduled article goes live", async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.article.findMany.mockResolvedValue([
        { id: 'article-1', title: 'Big Story', primaryAuthorId: 'author-1' },
      ]);
      articlesService.publish.mockResolvedValue({});

      await service.publishDueArticles();

      expect(notificationsService.create).toHaveBeenCalledWith(
        'author-1',
        'scheduled_article_published',
        expect.stringContaining('Big Story'),
        undefined,
        { articleId: 'article-1' },
      );
    });

    it('does not notify for an article that failed to publish', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.article.findMany.mockResolvedValue([
        { id: 'article-1', title: 'Broken Story', primaryAuthorId: 'author-1' },
      ]);
      articlesService.publish.mockRejectedValue(new Error('DB hiccup'));

      await service.publishDueArticles();

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });
});
