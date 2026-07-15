import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleStatus, NewsItemStatus, Prisma } from '@prisma/client';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { sanitizeArticleHtml } from '../../common/sanitize-html';
import { AIWriterService } from '../ai/ai-writer.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SettingsService } from '../settings/settings.service';
import { CategoriesService } from '../categories/categories.service';
import { ArticlesService } from '../articles/articles.service';

export const AUTONOMOUS_PIPELINE_SETTINGS = {
  enabled: 'news.autonomous_pipeline.enabled',
  authorUserId: 'news.autonomous_pipeline.author_user_id',
} as const;

/**
 * Discover -> AI rewrite -> quality-gated publish, with zero schema
 * migrations: reuses NewsCluster/NewsItem (discovery+clustering, already
 * built), ArticleAiAnalysis (already used for AI cost tracking), and the
 * org-scoped Setting model (same reuse pattern as the ad-widget feature)
 * for per-org opt-in config.
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
  ) {}

  async runCycle(organizationId: string): Promise<{ processed: number; published: number; flagged: number }> {
    const [enabled, authorUserId] = await Promise.all([
      this.settings.get(organizationId, AUTONOMOUS_PIPELINE_SETTINGS.enabled),
      this.settings.get(organizationId, AUTONOMOUS_PIPELINE_SETTINGS.authorUserId),
    ]);

    if (!enabled || !authorUserId) {
      return { processed: 0, published: 0, flagged: 0 };
    }

    const providerStatus = await this.systemSettings.getAiProviderStatus();
    if (!providerStatus.openai && !providerStatus.anthropic && !providerStatus.google) {
      this.logger.debug(
        `Autonomous pipeline enabled for org ${organizationId} but no AI provider key is configured yet - skipping.`,
      );
      return { processed: 0, published: 0, flagged: 0 };
    }

    const minSources = this.config.get<number>('AUTONOMOUS_PIPELINE_MIN_SOURCES', 1);
    const stabilizationMinutes = this.config.get<number>('AUTONOMOUS_PIPELINE_STABILIZATION_MINUTES', 20);
    const maxPerCycle = this.config.get<number>('AUTONOMOUS_PIPELINE_MAX_PER_CYCLE', 3);

    const clusters = await this.prisma.newsCluster.findMany({
      where: {
        organizationId,
        itemCount: { gte: minSources },
        lastUpdatedAt: { lte: new Date(Date.now() - stabilizationMinutes * 60_000) },
        newsItems: { none: { articleId: { not: null } } },
      },
      orderBy: { trendScore: 'desc' },
      take: maxPerCycle,
      include: { newsItems: { include: { source: true } } },
    });

    let published = 0;
    let flagged = 0;

    for (const cluster of clusters) {
      try {
        const outcome = await this.processCluster(cluster, organizationId, authorUserId as string);
        if (outcome === 'published') published++;
        if (outcome === 'flagged') flagged++;
      } catch (err: any) {
        this.logger.error(`Autonomous pipeline failed for cluster ${cluster.id}: ${err?.message ?? err}`);
      }
    }

    if (clusters.length > 0) {
      this.logger.log(
        `Autonomous pipeline processed ${clusters.length} cluster(s) for org ${organizationId}: ${published} published, ${flagged} flagged for review`,
      );
    }

    return { processed: clusters.length, published, flagged };
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
  ): Promise<'published' | 'flagged'> {
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

      await this.articlesService.update(
        shell.id,
        { content, status: pass ? ArticleStatus.PUBLISHED : ArticleStatus.IN_REVIEW },
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
            decision: pass ? 'published' : 'flagged_for_review',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await this.prisma.newsItem.updateMany({
        where: { clusterId: cluster.id },
        data: {
          articleId: shell.id,
          status: pass ? NewsItemStatus.PUBLISHED : NewsItemStatus.DRAFTED,
        },
      });

      return pass ? 'published' : 'flagged';
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
    } catch {
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
