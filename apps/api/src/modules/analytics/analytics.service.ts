import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

interface DailyViewRow {
  day: Date;
  count: bigint;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(organizationId: string, days = 30) {
    const since = this.sinceDate(days);

    const [totalViews, totalArticles, publishedInPeriod, topArticleGroups, dailyViewRows] =
      await Promise.all([
        this.prisma.articleView.count({
          where: { organizationId, viewedAt: { gte: since } },
        }),
        this.prisma.article.count({
          where: { organizationId, deletedAt: null },
        }),
        this.prisma.article.count({
          where: { organizationId, deletedAt: null, publishedAt: { gte: since } },
        }),
        this.prisma.articleView.groupBy({
          by: ['articleId'],
          _count: { articleId: true },
          where: { organizationId, viewedAt: { gte: since } },
          orderBy: { _count: { articleId: 'desc' } },
          take: 10,
        }),
        // Prisma has no portable date-trunc helper, so we bucket by day with a
        // parameterized raw query (tagged template = safe, no string concatenation).
        this.prisma.$queryRaw<DailyViewRow[]>`
          SELECT DATE_TRUNC('day', "viewedAt") AS day, COUNT(*)::bigint AS count
          FROM article_views
          WHERE "organizationId" = ${organizationId}::uuid
            AND "viewedAt" >= ${since}
          GROUP BY day
          ORDER BY day ASC
        `,
      ]);

    const topArticleIds = topArticleGroups.map((g) => g.articleId);
    const articles = await this.prisma.article.findMany({
      where: { id: { in: topArticleIds } },
      select: { id: true, title: true, slug: true },
    });
    const articleMap = new Map(articles.map((a) => [a.id, a]));

    const topArticles = topArticleGroups.map((g) => ({
      articleId: g.articleId,
      views: g._count.articleId,
      title: articleMap.get(g.articleId)?.title ?? null,
      slug: articleMap.get(g.articleId)?.slug ?? null,
    }));

    return {
      period: { days, since },
      totalViews,
      totalArticles,
      publishedInPeriod,
      topArticles,
      dailyViews: dailyViewRows.map((row) => ({ date: row.day, views: Number(row.count) })),
    };
  }

  // ─── Article Performance ───────────────────────────────────────────────────

  async getArticlePerformance(articleId: string, organizationId: string, days = 30) {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId, deletedAt: null },
      select: { id: true, title: true, slug: true },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const since = this.sinceDate(days);

    const [totalViews, uniqueSessions, dailyViewRows, referrerGroups, deviceGroups] =
      await Promise.all([
        this.prisma.articleView.count({
          where: { articleId, organizationId, viewedAt: { gte: since } },
        }),
        this.prisma.articleView.findMany({
          where: {
            articleId,
            organizationId,
            viewedAt: { gte: since },
            sessionId: { not: null },
          },
          distinct: ['sessionId'],
          select: { sessionId: true },
        }),
        this.prisma.$queryRaw<DailyViewRow[]>`
          SELECT DATE_TRUNC('day', "viewedAt") AS day, COUNT(*)::bigint AS count
          FROM article_views
          WHERE "articleId" = ${articleId}::uuid
            AND "organizationId" = ${organizationId}::uuid
            AND "viewedAt" >= ${since}
          GROUP BY day
          ORDER BY day ASC
        `,
        this.prisma.articleView.groupBy({
          by: ['referrer'],
          _count: { referrer: true },
          where: {
            articleId,
            organizationId,
            viewedAt: { gte: since },
            referrer: { not: null },
          },
          orderBy: { _count: { referrer: 'desc' } },
          take: 10,
        }),
        this.prisma.articleView.groupBy({
          by: ['device'],
          _count: { device: true },
          where: {
            articleId,
            organizationId,
            viewedAt: { gte: since },
            device: { not: null },
          },
          orderBy: { _count: { device: 'desc' } },
        }),
      ]);

    return {
      article,
      period: { days, since },
      totalViews,
      uniqueSessions: uniqueSessions.length,
      dailyViews: dailyViewRows.map((row) => ({ date: row.day, views: Number(row.count) })),
      topReferrers: referrerGroups.map((r) => ({
        referrer: r.referrer,
        count: r._count.referrer,
      })),
      deviceBreakdown: deviceGroups.map((d) => ({
        device: d.device,
        count: d._count.device,
      })),
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private sinceDate(days: number): Date {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return since;
  }
}
