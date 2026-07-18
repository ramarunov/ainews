import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleStatus, NewsItemStatus, Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { sanitizeArticleHtml } from '../../common/sanitize-html';
import { AIWriterService } from '../ai/ai-writer.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SettingsService } from '../settings/settings.service';
import { CategoriesService } from '../categories/categories.service';
import { ArticlesService } from '../articles/articles.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockPhotoService } from '../media/stock-photo.service';
import { buildStockPhotoQuery } from '../media/category-stock-query.util';

const CLUSTER_LOCK_PREFIX = 'autonomous-pipeline:lock:cluster:';
// Safety-net expiry, not the normal release path (that's the try/finally
// below) - only matters if the process crashes mid-cluster, so it just
// needs to clear well before the next scheduler tick (default 10 min).
const CLUSTER_LOCK_TTL_SECONDS = 300;

export const AUTONOMOUS_PIPELINE_SETTINGS = {
  enabled: 'news.autonomous_pipeline.enabled',
  authorUserId: 'news.autonomous_pipeline.author_user_id',
  // ISO 639-1 code (e.g. 'id'). Unset/null means "write in whatever
  // language the sources are in" (no translation instruction is added).
  outputLanguage: 'news.autonomous_pipeline.output_language',
  // Both unset/null means unlimited. Counted against Article.publishedAt
  // for isAiAssisted articles only - articles a human published manually
  // don't count against the autonomous pipeline's own quota.
  dailyLimit: 'news.autonomous_pipeline.daily_limit',
  hourlyLimit: 'news.autonomous_pipeline.hourly_limit',
} as const;

export interface AutonomousPipelineUsage {
  draftedToday: number;
  draftedThisHour: number;
  dailyLimit: number | null;
  hourlyLimit: number | null;
}

/**
 * Discover -> AI rewrite -> quality-gate -> IN_REVIEW, with zero schema
 * migrations: reuses NewsCluster/NewsItem (discovery+clustering, already
 * built), ArticleAiAnalysis (already used for AI cost tracking), and the
 * org-scoped Setting model (same reuse pattern as the ad-widget feature)
 * for per-org opt-in config.
 *
 * Deliberately never auto-publishes (product decision, 2026-07-18): every
 * article this pipeline produces lands at ArticleStatus.IN_REVIEW - the
 * quality gate (hallucination + quality-score check) still runs and its
 * pass/fail result still matters, but only as a priority signal for the
 * human reviewer, never as an auto-publish trigger. A human must always
 * take the actual publish action via the normal editor flow.
 *
 * Off by default per org (requires both `enabled` and `authorUserId`
 * settings) and inert platform-wide until an AI provider key is configured
 * — this must never throw noisily into logs for orgs that haven't opted in
 * or haven't added a key yet.
 */
@Injectable()
export class AutonomousPublishingService {
  private readonly logger = new Logger(AutonomousPublishingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiWriter: AIWriterService,
    private readonly systemSettings: SystemSettingsService,
    private readonly settings: SettingsService,
    private readonly categoriesService: CategoriesService,
    private readonly articlesService: ArticlesService,
    private readonly notificationsService: NotificationsService,
    private readonly stockPhotoService: StockPhotoService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async runCycle(organizationId: string): Promise<{ processed: number; readyForReview: number; flagged: number }> {
    const [enabled, authorUserId, outputLanguage] = await Promise.all([
      this.settings.get(organizationId, AUTONOMOUS_PIPELINE_SETTINGS.enabled),
      this.settings.get(organizationId, AUTONOMOUS_PIPELINE_SETTINGS.authorUserId),
      this.settings.get(organizationId, AUTONOMOUS_PIPELINE_SETTINGS.outputLanguage),
    ]);

    if (!enabled || !authorUserId) {
      return { processed: 0, readyForReview: 0, flagged: 0 };
    }

    const providerStatus = await this.systemSettings.getAiProviderStatus();
    if (!providerStatus.openai && !providerStatus.anthropic && !providerStatus.google) {
      this.logger.debug(
        `Autonomous pipeline enabled for org ${organizationId} but no AI provider key is configured yet - skipping.`,
      );
      return { processed: 0, readyForReview: 0, flagged: 0 };
    }

    const usage = await this.getUsageStats(organizationId);
    const dailyRemaining = usage.dailyLimit != null ? usage.dailyLimit - usage.draftedToday : Infinity;
    const hourlyRemaining = usage.hourlyLimit != null ? usage.hourlyLimit - usage.draftedThisHour : Infinity;
    const remainingBudget = Math.min(dailyRemaining, hourlyRemaining);

    if (remainingBudget <= 0) {
      this.logger.debug(
        `Autonomous pipeline for org ${organizationId} is at its drafting quota (${usage.draftedToday}/${usage.dailyLimit ?? '∞'} today, ${usage.draftedThisHour}/${usage.hourlyLimit ?? '∞'} this hour) - skipping cycle.`,
      );
      return { processed: 0, readyForReview: 0, flagged: 0 };
    }

    const minSources = this.config.get<number>('AUTONOMOUS_PIPELINE_MIN_SOURCES', 1);
    const stabilizationMinutes = this.config.get<number>('AUTONOMOUS_PIPELINE_STABILIZATION_MINUTES', 20);
    const maxPerCycle = this.config.get<number>('AUTONOMOUS_PIPELINE_MAX_PER_CYCLE', 3);
    // Cap the batch by remaining drafting budget too, so a cycle never pulls
    // more candidate clusters than it could actually draft before the next
    // quota check - overflow would just sit as extra IN_REVIEW load for no
    // benefit (or, if under quota next cycle, double-count against a budget
    // that's meant to pace draft creation).
    const take = Number.isFinite(remainingBudget) ? Math.min(maxPerCycle, remainingBudget) : maxPerCycle;

    const clusters = await this.prisma.newsCluster.findMany({
      where: {
        organizationId,
        itemCount: { gte: minSources },
        lastUpdatedAt: { lte: new Date(Date.now() - stabilizationMinutes * 60_000) },
        newsItems: { none: { articleId: { not: null } } },
      },
      orderBy: { trendScore: 'desc' },
      take,
      include: { newsItems: { include: { source: true } } },
    });

    let readyForReview = 0;
    let flagged = 0;

    for (const cluster of clusters) {
      // Claims the cluster before doing any work, so two overlapping
      // scheduler ticks (or a slow-running previous cycle) can't both pick
      // up the same cluster - the eligibility query above is a plain read
      // with no row locking, so without this a duplicate article was a
      // real, reproducible outcome (confirmed live during testing).
      const lockKey = `${CLUSTER_LOCK_PREFIX}${cluster.id}`;
      const acquired = await this.redis.set(lockKey, '1', 'EX', CLUSTER_LOCK_TTL_SECONDS, 'NX');
      if (!acquired) {
        this.logger.debug(`Cluster ${cluster.id} is already being processed elsewhere - skipping.`);
        continue;
      }

      try {
        const outcome = await this.processCluster(
          cluster,
          organizationId,
          authorUserId as string,
          (outputLanguage as string | null) ?? undefined,
        );
        if (outcome === 'ready_for_review') readyForReview++;
        if (outcome === 'flagged') flagged++;
      } catch (err: any) {
        this.logger.error(`Autonomous pipeline failed for cluster ${cluster.id}: ${err?.message ?? err}`);
      } finally {
        await this.redis.del(lockKey).catch(() => undefined);
      }
    }

    if (clusters.length > 0) {
      this.logger.log(
        `Autonomous pipeline processed ${clusters.length} cluster(s) for org ${organizationId}: ${readyForReview} ready for review, ${flagged} flagged for review`,
      );
    }

    return { processed: clusters.length, readyForReview, flagged };
  }

  // Read-only: powers the usage readout on the Autonomous Publishing
  // settings card, and doubles as the rate-limit check inside runCycle().
  async getUsageStats(organizationId: string): Promise<AutonomousPipelineUsage> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfHour = new Date(now);
    startOfHour.setUTCMinutes(0, 0, 0);

    // Keyed off createdAt, not publishedAt - this pipeline never sets
    // publishedAt itself anymore (everything lands at IN_REVIEW, a human
    // publishes it later, possibly much later or never), so the quota has
    // to cap how many drafts it *creates* per window, not how many it
    // "publishes" (a concept that no longer applies to this pipeline).
    const [dailyLimitRaw, hourlyLimitRaw, draftedToday, draftedThisHour] = await Promise.all([
      this.settings.get(organizationId, AUTONOMOUS_PIPELINE_SETTINGS.dailyLimit),
      this.settings.get(organizationId, AUTONOMOUS_PIPELINE_SETTINGS.hourlyLimit),
      this.prisma.article.count({
        where: { organizationId, isAiAssisted: true, createdAt: { gte: startOfDay } },
      }),
      this.prisma.article.count({
        where: { organizationId, isAiAssisted: true, createdAt: { gte: startOfHour } },
      }),
    ]);

    const dailyLimit = typeof dailyLimitRaw === 'number' ? dailyLimitRaw : null;
    const hourlyLimit = typeof hourlyLimitRaw === 'number' ? hourlyLimitRaw : null;

    return { draftedToday, draftedThisHour, dailyLimit, hourlyLimit };
  }

  private async processCluster(
    cluster: {
      id: string;
      title: string | null;
      newsItems: Array<{
        id: string;
        title: string;
        content: string | null;
        excerpt: string | null;
        url: string;
        publishedAt: Date | null;
        fetchedAt: Date;
        sourceName: string | null;
        source: { categoryHint: string | null } | null;
      }>;
    },
    organizationId: string,
    authorUserId: string,
    outputLanguage: string | undefined,
  ): Promise<'ready_for_review' | 'flagged'> {
    const items = [...cluster.newsItems].sort((a, b) => {
      const aTime = (a.publishedAt ?? a.fetchedAt).getTime();
      const bTime = (b.publishedAt ?? b.fetchedAt).getTime();
      return aTime - bTime;
    });
    const primary = items[0];
    const title = cluster.title ?? primary.title;

    const sources = items.map((item) => ({
      title: item.title,
      url: item.url,
      excerpt: (item.content ?? item.excerpt ?? '').slice(0, 800),
    }));

    const categoryId = await this.resolveCategory(primary.source?.categoryHint ?? null, organizationId);

    const rawContent = await this.aiWriter.generateDraft({
      title,
      sources,
      tone: 'authoritative',
      organizationId,
      outputLanguage,
    });
    const content = sanitizeArticleHtml(rawContent);

    const slug = await this.generateSlug(title, organizationId);

    const shell = await this.prisma.article.create({
      data: {
        organizationId,
        primaryAuthorId: authorUserId,
        primaryCategoryId: categoryId ?? undefined,
        title,
        slug,
        content: '',
        wordCount: 0,
        readingTime: 0,
        status: ArticleStatus.DRAFT,
        isAiAssisted: true,
        sourceUrl: primary.url,
        sourceName: primary.sourceName ?? undefined,
        newsItemId: primary.id,
      },
    });

    try {
      // When translating, the title passed to generateDraft above was only
      // used as a topic anchor (still in the source language) - derive a
      // real headline in the target language from the now-translated body
      // rather than leaving the source-language title on a translated
      // article. generateTitles() naturally matches the content's language.
      const localizedTitle = outputLanguage
        ? (await this.aiWriter.generateTitles({ content, count: 1, organizationId, articleId: shell.id, outputLanguage }))[0]
        : undefined;

      const [hallucination, qualityScore] = await Promise.all([
        this.aiWriter.checkHallucinations(
          content,
          sources.map((s) => ({ title: s.title, excerpt: s.excerpt })),
          organizationId,
          shell.id,
        ),
        this.aiWriter.calculateQualityScore(content, title, undefined, undefined, organizationId, shell.id),
      ]);

      const pass =
        hallucination.recommendation === 'SAFE_TO_PUBLISH' && qualityScore.canPublish === true;

      // Real (non-AI-generated) stock photo, auto-picked with no human
      // choice involved - see StockPhotoService's docstring for why this
      // pipeline specifically must never attach an AI-generated image to a
      // real, possibly-unreviewed news story. Best-effort: never blocks or
      // fails the publish itself if unconfigured, no results, or a network
      // error occurs.
      const categoryName = categoryId
        ? (await this.categoriesService.findOne(categoryId, organizationId).catch(() => null))?.name
        : null;
      const attachedImage = await this.stockPhotoService.autoAttachForQuery(
        buildStockPhotoQuery(categoryName),
        authorUserId,
        organizationId,
      );

      // Always IN_REVIEW - this pipeline never auto-publishes (product
      // decision, 2026-07-18: Google News' 2026 publisher guidance requires
      // AI-assisted content be human-curated, reviewed before publication).
      // `pass` still matters as a priority signal for the reviewer, just
      // never as a publish trigger.
      await this.articlesService.update(
        shell.id,
        {
          content,
          status: ArticleStatus.IN_REVIEW,
          ...(localizedTitle && { title: localizedTitle }),
          ...(outputLanguage && { language: outputLanguage }),
          ...(attachedImage && { featuredImageId: attachedImage.id }),
        },
        authorUserId,
        organizationId,
      );

      await this.prisma.articleAiAnalysis.create({
        data: {
          articleId: shell.id,
          analysisType: 'autonomous_gate',
          provider: 'pipeline',
          model: 'n/a',
          result: {
            hallucination,
            qualityScore,
            decision: pass ? 'passed_gate_pending_review' : 'flagged_for_review',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await this.prisma.newsItem.updateMany({
        where: { clusterId: cluster.id },
        data: {
          articleId: shell.id,
          status: NewsItemStatus.DRAFTED,
        },
      });

      const finalTitle = localizedTitle ?? title;
      // Fire-and-forget: a notification failure must never undo a
      // successful draft/flag decision (this runs after every write above
      // has already committed, unlike the try/catch's own cleanup path,
      // which only ever deletes a shell that never got this far).
      this.notificationsService
        .create(
          authorUserId,
          pass ? 'ai_article_ready_for_review' : 'ai_article_flagged',
          pass ? `AI draft ready for review: ${finalTitle}` : `AI draft needs review: ${finalTitle}`,
          pass
            ? 'Passed automated fact-check and quality checks - still needs a human review before publishing.'
            : `Fact-check: ${hallucination.recommendation.replaceAll('_', ' ')}. Quality score: ${qualityScore.overall}/100.`,
          { articleId: shell.id },
        )
        .catch((err) =>
          this.logger.error(`Failed to notify ${authorUserId} about article ${shell.id}: ${err?.message ?? err}`),
        );

      return pass ? 'ready_for_review' : 'flagged';
    } catch (err) {
      await this.prisma.article.delete({ where: { id: shell.id } });
      throw err;
    }
  }

  private async resolveCategory(categoryHint: string | null, organizationId: string): Promise<string | null> {
    if (!categoryHint) return null;
    try {
      const category = await this.categoriesService.findBySlug(slugify(categoryHint, { lower: true }), organizationId);
      return category.id;
    } catch (err) {
      // No matching category is an expected, silent outcome (most
      // categoryHints won't have an exact slug match) - but anything else
      // (DB hiccup, RLS context issue, etc.) is a real problem that was
      // previously invisible, silently producing an uncategorized article.
      if (!(err instanceof NotFoundException)) {
        this.logger.warn(
          `Category resolution failed unexpectedly for hint "${categoryHint}" in org ${organizationId}: ${(err as Error)?.message ?? err}`,
        );
      }
      return null;
    }
  }

  private async generateSlug(title: string, organizationId: string): Promise<string> {
    const base = slugify(title, { lower: true, strict: true });
    let slug = base;
    let attempt = 1;

    while (
      await this.prisma.article.findFirst({
        where: { organizationId, slug },
        select: { id: true },
      })
    ) {
      attempt++;
      slug = `${base}-${attempt}`;
    }

    return slug;
  }
}
