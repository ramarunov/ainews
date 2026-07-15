/**
 * @jest-environment jsdom
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
 */
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
      redis,
    );
  });

  it('no-ops without calling any AI service when the org has not opted in', async () => {
    settings.get.mockResolvedValue(null);

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, published: 0, flagged: 0 });
    expect(prisma.newsCluster.findMany).not.toHaveBeenCalled();
    expect(aiWriter.generateDraft).not.toHaveBeenCalled();
  });

  it('no-ops when no AI provider key is configured platform-wide', async () => {
    systemSettings.getAiProviderStatus.mockResolvedValue({ openai: false, anthropic: false, google: false });

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, published: 0, flagged: 0 });
    expect(prisma.newsCluster.findMany).not.toHaveBeenCalled();
  });

  it('skips the cycle once the daily publish quota is reached', async () => {
    settings.get.mockImplementation((_orgId: string, key: string) => {
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.dailyLimit) return Promise.resolve(5);
      return Promise.resolve(null);
    });
    prisma.article.count.mockResolvedValue(5); // already at the daily limit

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, published: 0, flagged: 0 });
    expect(prisma.newsCluster.findMany).not.toHaveBeenCalled();
  });

  it('skips the cycle once the hourly publish quota is reached', async () => {
    settings.get.mockImplementation((_orgId: string, key: string) => {
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.enabled) return Promise.resolve(true);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.authorUserId) return Promise.resolve(AUTHOR_ID);
      if (key === AUTONOMOUS_PIPELINE_SETTINGS.hourlyLimit) return Promise.resolve(2);
      return Promise.resolve(null);
    });
    // First count() call is "today" (under its unlimited quota), second is "this hour" (at limit).
    prisma.article.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 0, published: 0, flagged: 0 });
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

  it('publishes automatically when the quality gate passes', async () => {
    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, published: 1, flagged: 0 });
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
      expect.objectContaining({ status: ArticleStatus.PUBLISHED }),
      AUTHOR_ID,
      ORG_ID,
    );
    expect(prisma.newsItem.updateMany).toHaveBeenCalledWith({
      where: { clusterId: 'cluster-1' },
      data: { articleId: 'article-1', status: NewsItemStatus.PUBLISHED },
    });
    expect(prisma.articleAiAnalysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ articleId: 'article-1', analysisType: 'autonomous_gate' }),
      }),
    );
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

    expect(result).toEqual({ processed: 1, published: 1, flagged: 0 });
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

      expect(result).toEqual({ processed: 1, published: 0, flagged: 0 });
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

    expect(result).toEqual({ processed: 1, published: 0, flagged: 1 });
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

    expect(result).toEqual({ processed: 1, published: 0, flagged: 1 });
  });

  it('does not leave an orphan article shell when generateDraft throws', async () => {
    aiWriter.generateDraft.mockRejectedValue(new Error('AI service is temporarily unavailable'));

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, published: 0, flagged: 0 });
    expect(prisma.article.create).not.toHaveBeenCalled();
    expect(prisma.article.delete).not.toHaveBeenCalled();
  });

  it('deletes the article shell if the quality-gate calls throw after creation', async () => {
    aiWriter.checkHallucinations.mockRejectedValue(new Error('provider timeout'));

    const result = await service.runCycle(ORG_ID);

    expect(result).toEqual({ processed: 1, published: 0, flagged: 0 });
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
