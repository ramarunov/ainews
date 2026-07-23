/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 *
 * Imports common/sanitize-html -> isomorphic-dompurify, which needs a real
 * `window` (via jsdom) even when unused by the code path under test here.
 * See articles.service.spec.ts for the same requirement.
 *
 * Also transitively imports AIWriterService -> ai-gateway.service ->
 * providers/ai-providers -> the real openai SDK, which probes for Web
 * Fetch API globals (fetch/Request/Response/...) at *module load* time
 * (even with jest.mock('openai'), automocking still requires loading the
 * real module to inspect its shape) and throws under jest-environment-jsdom,
 * which doesn't expose these. AIWriterService is always mocked in these
 * tests (a plain object, never instantiated) so these are load-bearing
 * stubs only, never actually invoked.
 *
 * Also transitively imports the real jsdom *package* (via
 * ArticleInternalLinkingService), which needs TextEncoder/TextDecoder at
 * import time via whatwg-url - not provided by jest's jsdom test environment.
 *
 * Also now transitively imports StockPhotoService -> MediaService ->
 * StorageService -> @aws-sdk/client-s3, which under plain jest-environment-
 * jsdom's browser-like export-condition resolution loads an ESM-only
 * browser build Jest's CJS transform can't parse. The customExportConditions
 * override above forces Node resolution instead - same fix already used in
 * comments.service.spec.ts / news-intelligence.service.spec.ts for the
 * same class of issue with a different package (@opensearch-project/opensearch).
 */
import { TextEncoder, TextDecoder } from 'node:util';

(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

for (const name of ['fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'ReadableStream']) {
  (global as any)[name] = (global as any)[name] || class {};
}

import { Logger, NotFoundException } from '@nestjs/common';
import { ArticleStatus, NewsItemStatus } from '@prisma/client';
import {
  AutonomousPublishingService,
  AUTONOMOUS_PIPELINE_SETTINGS,
} from './autonomous-publishing.service';

describe('AutonomousPublishingService', () => {
  let service: AutonomousPublishingService;
  let prisma: any;
  let config: any;
  let aiWriter: any;
  let systemSettings: any;
  let settings: any;
  let categoriesService: any;
  let articlesService: any;
  let notificationsService: any;
  let stockPhotoService: any;
  let redis: any;

  const ORG_ID = 'org-1';
  const AUTHOR_ID = 'user-ai-newsroom';

  const cluster = {
    id: 'cluster-1',
    title: 'Big Story',
    trendScore: 5,
    newsItems: [
      {
        id: 'item-1',
        title: 'Big Story breaks',
        content: 'Full article body from source A.',
        excerpt: null,
        url: 'https://a.example.com/big-story',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        fetchedAt: new Date('2026-01-01T00:05:00Z'),
        sourceName: 'Source A',
        source: { categoryHint: null },
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      newsCluster: { findMany: jest.fn().mockResolvedValue([cluster]) },
      article: {
        create: jest.fn().mockResolvedValue({ id: 'article-1' }),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      articleAiAnalysis: { create: jest.fn().mockResolvedValue({}) },
      newsItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    config = { get: jest.fn((_key: string, def: any) => def) };
    aiWriter = {
      generateDraft: jest.fn().mockResolvedValue('<p>AI written article body.</p>'),
      generateTitles: jest.fn().mockResolvedValue(['Localized Headline']),
      checkHallucinations: jest.fn().mockResolvedValue({
        overallConfidence: 0.9,
        claims: [],
        recommendation: 'SAFE_TO_PUBLISH',
      }),
      calculateQualityScore: jest.fn().mockResolvedValue({
        overall: 90,
        breakdown: {},
        issues: [],
        recommendations: [],
        canPublish: true,
      }),
      // Empty by default so existing tests' category-based fallback
      // expectation ('newspaper journalism') keeps holding unchanged.
      suggestStockPhotoQuery: jest.fn().mockResolvedValue(''),
    };
    systemSettings = {
      getAiProviderStatus: jest.fn().mockResolvedValue({ openai: true, anthropic: false, google: false }),
    };
    settings = {
      get: jest.fn((_orgId: string, key: string) => {
        if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
        if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
        return Promise.resolve(null);
      }),
    };
    categoriesService = {
      findBySlug: jest.fn().mockRejectedValue(new NotFoundException('Category not found')),
    };
    articlesService = { update: jest.fn().mockResolvedValue({}) };
    notificationsService = { create: jest.fn().mockResolvedValue({}) };
    stockPhotoService = { autoAttachForQuery: jest.fn().mockResolvedValue(null) };
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    service = new AutonomousPublishingService(
      prisma,
      config,
      aiWriter,
      systemSettings,
      settings,
      categoriesService,
      articlesService,
      notificationsService,
      stockPhotoService,
      redis,
    );
  });

  it('no-ops without calling any AI service when the org has not opted in', async () => {
    settings.get.mockResolvedValue(null);

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, readyForReview: 0, flagged: 0, autoPublished: 0 });
    expect(prisma.newsCluster.findMany).not.toHaveBeenCalled();
    expect(aiWriter.generateDraft).not.toHaveBeenCalled();
  });

  it('no-ops when no AI provider key is configured platform-wide', async () => {
    systemSettings.getAiProviderStatus.mockResolvedValue({ openai: false, anthropic: false, google: false });

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, readyForReview: 0, flagged: 0, autoPublished: 0 });
    expect(prisma.newsCluster.findMany).not.toHaveBeenCalled();
  });

  it('skips the cycle once the daily drafting quota is reached', async () => {
    settings.get.mockImplementation((_orgId: string, key: string) => {
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.dailyLimit) return Promise.resolve(5);
      return Promise.resolve(null);
    });
    prisma.article.count.mockResolvedValue(5); // already at the daily limit

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, readyForReview: 0, flagged: 0, autoPublished: 0 });
    expect(prisma.newsCluster.findMany).not.toHaveBeenCalled();
  });

  it('skips the cycle once the hourly drafting quota is reached', async () => {
    settings.get.mockImplementation((_orgId: string, key: string) => {
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.hourlyLimit) return Promise.resolve(2);
      return Promise.resolve(null);
    });
    // First count() call is "today" (under its unlimited quota), second is "this hour" (at limit).
    prisma.article.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, readyForReview: 0, flagged: 0, autoPublished: 0 });
    expect(prisma.newsCluster.findMany).not.toHaveBeenCalled();
  });

  it('caps the cluster batch by remaining quota rather than the configured max-per-cycle', async () => {
    settings.get.mockImplementation((_orgId: string, key: string) => {
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.dailyLimit) return Promise.resolve(10);
      return Promise.resolve(null);
    });
    prisma.article.count.mockResolvedValue(9); // only 1 left in today's budget
    config.get.mockImplementation((key: string, def: any) =>
      key === 'AUTONOMOUS_PIPELINE_MAX_PER_CYCLE' ? 3 : def,
    );

    await service.runCycle(ORG_ID);

    expect(prisma.newsCluster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it('only considers clusters within the configured freshness window, not just unstabilized/undrafted ones', async () => {
    config.get.mockImplementation((key: string, def: any) =>
      key === 'AUTONOMOUS_PIPELINE_MAX_AGE_HOURS' ? 48 : def,
    );
    const before = Date.now();

    await service.runCycle(ORG_ID);

    expect(prisma.newsCluster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          firstSeenAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
    const { firstSeenAt } = (prisma.newsCluster.findMany.mock.calls[0][0] as any).where;
    const ageMs = before - firstSeenAt.gte.getTime();
    // Should be ~48h before "now" (within a few seconds of test execution slack).
    expect(ageMs).toBeGreaterThan(48 * 60 * 60_000 - 5000);
    expect(ageMs).toBeLessThan(48 * 60 * 60_000 + 5000);
  });

  it('omits sourceUrl rather than storing a Google News redirect link that would confuse readers', async () => {
    const clusterFromGoogleNews = {
      ...cluster,
      newsItems: [
        { ...cluster.newsItems[0], url: 'https://news.google.com/rss/articles/CBMi-some-token?oc=5' },
      ],
    };
    prisma.newsCluster.findMany.mockResolvedValue([clusterFromGoogleNews]);

    await service.runCycle(ORG_ID);

    expect(prisma.article.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceUrl: undefined }),
      }),
    );
  });

  it('routes to review with a passed-gate signal, never auto-publishing, when the quality gate passes', async () => {
    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 1, flagged: 0, autoPublished: 0 });
    expect(prisma.article.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          primaryAuthorId: AUTHOR_ID,
          isAiAssisted: true,
          newsItemId: 'item-1',
          status: ArticleStatus.DRAFT,
        }),
      }),
    );
    expect(articlesService.update).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ status: ArticleStatus.IN_REVIEW }),
      AUTHOR_ID,
      ORG_ID,
    );
    expect(prisma.newsItem.updateMany).toHaveBeenCalledWith({
      where: { clusterId: 'cluster-1' },
      data: { articleId: 'article-1', status: NewsItemStatus.DRAFTED },
    });
    expect(prisma.articleAiAnalysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ articleId: 'article-1', analysisType: 'autonomous_gate' }),
      }),
    );
    expect(prisma.article.delete).not.toHaveBeenCalled();
    expect(notificationsService.create).toHaveBeenCalledWith(
      AUTHOR_ID,
      'ai_article_ready_for_review',
      expect.stringContaining('AI draft ready for review:'),
      expect.stringContaining('still needs a human review'),
      { articleId: 'article-1' },
    );
  });

  describe('auto-publish confidence threshold', () => {
    // Default mocks: hallucination.overallConfidence 0.9 (90%), qualityScore.overall 90 ->
    // combinedConfidencePct = min(90, 90) = 90.
    function withThreshold(threshold: number | null) {
      settings.get.mockImplementation((_orgId: string, key: string) => {
        if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
        if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
        if (key === AUTONOMOUS_PIPELINE_SETTINGS.autoPublishConfidenceThreshold) return Promise.resolve(threshold);
        return Promise.resolve(null);
      });
    }

    it('auto-publishes when the gate passes and confidence meets the configured threshold', async () => {
      withThreshold(90);

      const result = await service.runCycle(ORG_ID);

      expect(result).toEqual({ processed: 1, readyForReview: 0, flagged: 0, autoPublished: 1 });
      expect(articlesService.update).toHaveBeenCalledWith(
        'article-1',
        expect.objectContaining({ status: ArticleStatus.PUBLISHED }),
        AUTHOR_ID,
        ORG_ID,
      );
      expect(prisma.articleAiAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: expect.objectContaining({ decision: 'auto_published', autoPublishThreshold: 90 }),
          }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        AUTHOR_ID,
        'ai_article_published',
        expect.stringContaining('AI article auto-published:'),
        expect.stringContaining('published automatically'),
        { articleId: 'article-1' },
      );
    });

    it('stays IN_REVIEW when confidence is below the configured threshold, even though the gate passed', async () => {
      withThreshold(100); // combined confidence (90) falls short of 100

      const result = await service.runCycle(ORG_ID);

      expect(result).toEqual({ processed: 1, readyForReview: 1, flagged: 0, autoPublished: 0 });
      expect(articlesService.update).toHaveBeenCalledWith(
        'article-1',
        expect.objectContaining({ status: ArticleStatus.IN_REVIEW }),
        AUTHOR_ID,
        ORG_ID,
      );
    });

    it('never auto-publishes a failed gate, even at a 100% confidence number and a 70% threshold', async () => {
      withThreshold(70);
      aiWriter.checkHallucinations.mockResolvedValue({
        overallConfidence: 1.0,
        claims: [],
        recommendation: 'DO_NOT_PUBLISH',
      });

      const result = await service.runCycle(ORG_ID);

      expect(result).toEqual({ processed: 1, readyForReview: 0, flagged: 1, autoPublished: 0 });
      expect(articlesService.update).toHaveBeenCalledWith(
        'article-1',
        expect.objectContaining({ status: ArticleStatus.IN_REVIEW }),
        AUTHOR_ID,
        ORG_ID,
      );
    });

    it('treats a stored threshold outside the 70/80/90/100 checklist as unset (always review)', async () => {
      withThreshold(55); // not one of AUTO_PUBLISH_CONFIDENCE_LEVELS - e.g. hand-edited via the API

      const result = await service.runCycle(ORG_ID);

      expect(result).toEqual({ processed: 1, readyForReview: 1, flagged: 0, autoPublished: 0 });
    });
  });

  it('attaches an auto-picked stock photo to the article when one is found', async () => {
    stockPhotoService.autoAttachForQuery.mockResolvedValue({ id: 'media-photo-1' });

    await service.runCycle(ORG_ID);

    expect(stockPhotoService.autoAttachForQuery).toHaveBeenCalledWith(
      'newspaper journalism', // no category resolved in this default test setup
      AUTHOR_ID,
      ORG_ID,
    );
    expect(articlesService.update).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ featuredImageId: 'media-photo-1' }),
      AUTHOR_ID,
      ORG_ID,
    );
  });

  it('sends the article to review with no featured image, not an error, when no stock photo could be attached', async () => {
    stockPhotoService.autoAttachForQuery.mockResolvedValue(null);

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 1, flagged: 0, autoPublished: 0 });
    const updateCall = articlesService.update.mock.calls[0][1];
    expect(updateCall).not.toHaveProperty('featuredImageId');
  });

  it('searches for a stock photo using the AI-suggested, headline-specific query when one is available', async () => {
    aiWriter.suggestStockPhotoQuery.mockResolvedValue('protest crowd street');

    await service.runCycle(ORG_ID);

    expect(aiWriter.suggestStockPhotoQuery).toHaveBeenCalledWith('Big Story', ORG_ID, 'article-1');
    expect(stockPhotoService.autoAttachForQuery).toHaveBeenCalledWith(
      'protest crowd street',
      AUTHOR_ID,
      ORG_ID,
    );
  });

  it('falls back to the generic category query when the AI stock-photo query call fails', async () => {
    aiWriter.suggestStockPhotoQuery.mockRejectedValue(new Error('AI gateway down'));

    await service.runCycle(ORG_ID);

    expect(stockPhotoService.autoAttachForQuery).toHaveBeenCalledWith(
      'newspaper journalism',
      AUTHOR_ID,
      ORG_ID,
    );
  });

  it('notifies the configured author when an article is flagged for review, with the reason in the body', async () => {
    aiWriter.checkHallucinations.mockResolvedValue({
      overallConfidence: 0.2,
      claims: [],
      recommendation: 'REVIEW_BEFORE_PUBLISH',
    });

    await service.runCycle(ORG_ID);

    expect(notificationsService.create).toHaveBeenCalledWith(
      AUTHOR_ID,
      'ai_article_flagged',
      expect.stringContaining('AI draft needs review:'),
      expect.stringContaining('REVIEW BEFORE PUBLISH'),
      { articleId: 'article-1' },
    );
  });

  it('does not undo a successful review/flag decision if sending the notification fails', async () => {
    notificationsService.create.mockRejectedValue(new Error('notification service down'));

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 1, flagged: 0, autoPublished: 0 });
    expect(prisma.article.delete).not.toHaveBeenCalled();
  });

  it('translates the article and headline when an output language is configured', async () => {
    settings.get.mockImplementation((_orgId: string, key: string) => {
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.outputLanguage) return Promise.resolve('id');
      return Promise.resolve(null);
    });

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 1, flagged: 0, autoPublished: 0 });
    expect(aiWriter.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ outputLanguage: 'id' }),
    );
    expect(aiWriter.generateTitles).toHaveBeenCalledWith(
      expect.objectContaining({ content: '<p>AI written article body.</p>', count: 1, outputLanguage: 'id' }),
    );
    expect(articlesService.update).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ title: 'Localized Headline', language: 'id' }),
      AUTHOR_ID,
      ORG_ID,
    );
  });

  describe('cluster locking (concurrent-run protection)', () => {
    it('claims the cluster with a Redis lock before processing, and releases it afterwards', async () => {
      await service.runCycle(ORG_ID);

      expect(redis.set).toHaveBeenCalledWith(
        'autonomous-pipeline:lock:cluster:cluster-1',
        '1',
        'EX',
        300,
        'NX',
      );
      expect(redis.del).toHaveBeenCalledWith('autonomous-pipeline:lock:cluster:cluster-1');
    });

    it('skips a cluster another process already claimed, without touching it at all', async () => {
      redis.set.mockResolvedValue(null); // NX lock already held elsewhere

      const result = await service.runCycle(ORG_ID);

      expect(result).toEqual({ processed: 1, readyForReview: 0, flagged: 0, autoPublished: 0 });
      expect(prisma.article.create).not.toHaveBeenCalled();
      expect(aiWriter.generateDraft).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('still releases the lock when processing the cluster throws', async () => {
      aiWriter.generateDraft.mockRejectedValue(new Error('boom'));

      await service.runCycle(ORG_ID);

      expect(redis.del).toHaveBeenCalledWith('autonomous-pipeline:lock:cluster:cluster-1');
    });
  });

  describe('resolveCategory error handling', () => {
    it('does not log a warning when a category simply has no matching slug', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      categoriesService.findBySlug.mockRejectedValue(new NotFoundException('Category not found'));

      await service.runCycle(ORG_ID);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('logs a warning when category resolution fails for an unexpected reason', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      categoriesService.findBySlug.mockRejectedValue(new Error('connection reset'));
      const clusterWithCategoryHint = {
        ...cluster,
        newsItems: [{ ...cluster.newsItems[0], source: { categoryHint: 'Politik' } }],
      };
      prisma.newsCluster.findMany.mockResolvedValue([clusterWithCategoryHint]);

      await service.runCycle(ORG_ID);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('connection reset'));
      warnSpy.mockRestore();
    });
  });

  it('does not attempt title localization when no output language is configured', async () => {
    await service.runCycle(ORG_ID);

    expect(aiWriter.generateTitles).not.toHaveBeenCalled();
    expect(articlesService.update).toHaveBeenCalledWith(
      'article-1',
      expect.not.objectContaining({ title: expect.anything() }),
      AUTHOR_ID,
      ORG_ID,
    );
  });

  it('routes to human review instead of publishing when the hallucination check fails', async () => {
    aiWriter.checkHallucinations.mockResolvedValue({
      overallConfidence: 0.2,
      claims: [{ text: 'suspicious stat', confidence: 0.1, flag: 'DISPUTED', reason: 'no source' }],
      recommendation: 'DO_NOT_PUBLISH',
    });

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 0, flagged: 1, autoPublished: 0 });
    expect(articlesService.update).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ status: ArticleStatus.IN_REVIEW }),
      AUTHOR_ID,
      ORG_ID,
    );
    expect(prisma.newsItem.updateMany).toHaveBeenCalledWith({
      where: { clusterId: 'cluster-1' },
      data: { articleId: 'article-1', status: NewsItemStatus.DRAFTED },
    });
  });

  it('routes to human review when the quality score says canPublish is false', async () => {
    aiWriter.calculateQualityScore.mockResolvedValue({
      overall: 40,
      breakdown: {},
      issues: ['Thin content'],
      recommendations: ['Add more detail'],
      canPublish: false,
    });

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 0, flagged: 1, autoPublished: 0 });
  });

  it('does not leave an orphan article shell when generateDraft throws', async () => {
    aiWriter.generateDraft.mockRejectedValue(new Error('AI service is temporarily unavailable'));

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 0, flagged: 0, autoPublished: 0 });
    expect(prisma.article.create).not.toHaveBeenCalled();
    expect(prisma.article.delete).not.toHaveBeenCalled();
  });

  it('deletes the article shell if the quality-gate calls throw after creation', async () => {
    aiWriter.checkHallucinations.mockRejectedValue(new Error('provider timeout'));

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, readyForReview: 0, flagged: 0, autoPublished: 0 });
    expect(prisma.article.create).toHaveBeenCalled();
    expect(prisma.article.delete).toHaveBeenCalledWith({ where: { id: 'article-1' } });
    expect(articlesService.update).not.toHaveBeenCalled();
  });

  it('skips a cluster that already produced an article without needing app-level filtering (query-level exclusion assumed)', async () => {
    // The eligibility query itself excludes already-drafted clusters (asserted via the
    // findMany where-clause), so this test just confirms runCycle passes the right shape.
    await service.runCycle(ORG_ID);

    expect(prisma.newsCluster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          newsItems: { none: { articleId: { not: null } } },
        }),
      }),
    );
  });
});
