import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bull';
import { NewsSourceType, NewsItemStatus, ArticleStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CreateNewsSourceDto,
  UpdateNewsSourceDto,
  NewsSourceQueryDto,
  CreateNewsItemDto,
  NewsItemQueryDto,
} from './dto/news-intelligence.dto';
import { NEWS_INGESTION_QUEUE } from './news-intelligence.constants';
import { NewsClusteringService } from './news-clustering.service';

export interface IngestSourceJobData {
  sourceId: string;
  organizationId: string;
}

@Injectable()
export class NewsIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly clusteringService: NewsClusteringService,
    @InjectQueue(NEWS_INGESTION_QUEUE) private readonly ingestionQueue: Queue<IngestSourceJobData>,
  ) {}

  // ─── Sources ───────────────────────────────────────────────────────────────

  async createSource(dto: CreateNewsSourceDto, organizationId: string) {
    return this.prisma.newsSource.create({
      data: {
        organizationId,
        name: dto.name,
        type: dto.type,
        url: dto.url,
        config: (dto.config as Prisma.InputJsonValue) ?? {},
        categoryHint: dto.categoryHint,
        language: dto.language ?? 'en',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllSources(organizationId: string, query: NewsSourceQueryDto) {
    const { isActive, type } = query;

    return this.prisma.newsSource.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(isActive !== undefined && { isActive }),
        ...(type && { type }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneSource(id: string, organizationId: string) {
    const source = await this.prisma.newsSource.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!source) {
      throw new NotFoundException('News source not found');
    }

    return source;
  }

  async updateSource(id: string, dto: UpdateNewsSourceDto, organizationId: string) {
    await this.findOneSource(id, organizationId);

    return this.prisma.newsSource.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.config !== undefined && { config: dto.config as Prisma.InputJsonValue }),
        ...(dto.categoryHint !== undefined && { categoryHint: dto.categoryHint }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async removeSource(id: string, organizationId: string) {
    await this.findOneSource(id, organizationId);

    await this.prisma.newsSource.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { success: true, message: 'News source deleted' };
  }

  // ─── Ingestion ─────────────────────────────────────────────────────────────

  /**
   * Manual "ingest now" trigger. Validates the source synchronously (so a
   * bad ID still 404s immediately, not after a round-trip through the
   * queue), then enqueues the actual fetch onto the same
   * NewsIngestionProcessor the scheduled job uses — one code path for
   * both triggers — and waits for it to finish so this keeps its original
   * synchronous response shape ({itemsFound, itemsCreated, itemsSkipped}).
   *
   * Bull's job.finished() resolves/rejects with whatever the processor
   * returned/threw, but a thrown NestJS exception loses its class identity
   * once serialized through Redis and back — only .message survives. The
   * upfront findOneSource() call preserves the correct 404 for a missing
   * source; any other failure is deliberately re-wrapped as
   * BadRequestException below to keep this endpoint's existing contract
   * (400, not a generic 500) for bad feed URLs / fetch failures.
   */
  async enqueueAndAwaitIngest(sourceId: string, organizationId: string) {
    await this.findOneSource(sourceId, organizationId);

    const job = await this.ingestionQueue.add('ingest-source', { sourceId, organizationId });
    try {
      return await job.finished();
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Ingestion failed');
    }
  }

  async ingestSource(sourceId: string, organizationId: string) {
    const source = await this.findOneSource(sourceId, organizationId);

    if (source.type !== NewsSourceType.RSS && source.type !== NewsSourceType.ATOM) {
      throw new BadRequestException(
        `Automated ingestion is not implemented for source type "${source.type}" yet. Use manual item creation for MANUAL sources.`,
      );
    }

    let itemsFound = 0;
    let itemsCreated = 0;
    let itemsSkipped = 0;

    try {
      const parser = new Parser();
      const feed = await parser.parseURL(source.url);
      itemsFound = feed.items?.length ?? 0;

      for (const item of feed.items ?? []) {
        if (!item.link) {
          itemsSkipped++;
          continue;
        }

        const urlHash = createHash('sha256').update(item.link).digest('hex');

        const existing = await this.prisma.newsItem.findUnique({
          where: { organizationId_urlHash: { organizationId, urlHash } },
        });

        if (existing) {
          itemsSkipped++;
          continue;
        }

        try {
          const created = await this.prisma.newsItem.create({
            data: {
              organizationId,
              sourceId: source.id,
              title: item.title ?? 'Untitled',
              content: item.contentSnippet ?? item.content ?? null,
              url: item.link,
              urlHash,
              authorName: item.creator ?? item.author ?? null,
              sourceName: source.name,
              category: source.categoryHint,
              language: source.language,
              publishedAt: item.isoDate ? new Date(item.isoDate) : null,
              status: NewsItemStatus.NEW,
            },
          });
          itemsCreated++;

          // Best-effort: a clustering/entity-extraction failure must not
          // abort ingestion of the rest of the feed.
          await this.clusteringService
            .processItem(created.id, organizationId)
            .catch((err) => console.error(`[NewsIntelligenceService] Clustering failed for item ${created.id}`, err));
        } catch (err: any) {
          if (err?.code === 'P2002') {
            itemsSkipped++;
            continue;
          }
          throw err;
        }
      }

      await this.prisma.newsSource.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: new Date(),
          fetchCount: { increment: 1 },
        },
      });
    } catch (error: any) {
      await this.prisma.newsSource.update({
        where: { id: source.id },
        data: {
          errorCount: { increment: 1 },
          lastError: error?.message ?? 'Unknown ingestion error',
        },
      });

      throw new BadRequestException(
        `Failed to ingest news source "${source.name}": ${error?.message ?? error}`,
      );
    }

    return { itemsFound, itemsCreated, itemsSkipped };
  }

  async createItem(dto: CreateNewsItemDto, organizationId: string) {
    const source = await this.findOneSource(dto.sourceId, organizationId);

    const urlHash = createHash('sha256').update(dto.url).digest('hex');

    const existing = await this.prisma.newsItem.findUnique({
      where: { organizationId_urlHash: { organizationId, urlHash } },
    });

    if (existing) {
      throw new BadRequestException('A news item with this URL already exists');
    }

    const created = await this.prisma.newsItem.create({
      data: {
        organizationId,
        sourceId: source.id,
        title: dto.title,
        content: dto.content,
        excerpt: dto.excerpt,
        url: dto.url,
        urlHash,
        authorName: dto.authorName,
        sourceName: source.name,
        category: dto.category ?? source.categoryHint,
        tags: dto.tags ?? [],
        language: source.language,
        status: NewsItemStatus.NEW,
      },
    });

    // Fire-and-forget: this is a synchronous HTTP request, unlike the
    // ingestion path's background job - clustering must not add AI
    // latency to the response.
    this.clusteringService
      .processItem(created.id, organizationId)
      .catch((err) => console.error(`[NewsIntelligenceService] Clustering failed for item ${created.id}`, err));

    return created;
  }

  // ─── Items ─────────────────────────────────────────────────────────────────

  async findAllItems(organizationId: string, query: NewsItemQueryDto) {
    const { status, sourceId, category, page = 1, limit = 20 } = query;

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const where: Prisma.NewsItemWhereInput = {
      organizationId,
      ...(status && { status }),
      ...(sourceId && { sourceId }),
      ...(category && { category }),
    };

    const [items, total] = await Promise.all([
      this.prisma.newsItem.findMany({
        where,
        skip,
        take,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.newsItem.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page: Math.max(1, page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findOneItem(id: string, organizationId: string) {
    const item = await this.prisma.newsItem.findFirst({
      where: { id, organizationId },
    });

    if (!item) {
      throw new NotFoundException('News item not found');
    }

    return item;
  }

  async updateItemStatus(id: string, status: NewsItemStatus, organizationId: string) {
    await this.findOneItem(id, organizationId);

    return this.prisma.newsItem.update({
      where: { id },
      data: { status },
    });
  }

  async ignoreItem(id: string, organizationId: string) {
    await this.findOneItem(id, organizationId);

    return this.prisma.newsItem.update({
      where: { id },
      data: { status: NewsItemStatus.IGNORED },
    });
  }

  // ─── Clusters (NEWS-005) ────────────────────────────────────────────────────

  async findAllClusters(organizationId: string, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const where: Prisma.NewsClusterWhereInput = { organizationId };

    const [clusters, total] = await Promise.all([
      this.prisma.newsCluster.findMany({
        where,
        skip,
        take,
        orderBy: { lastUpdatedAt: 'desc' },
      }),
      this.prisma.newsCluster.count({ where }),
    ]);

    return {
      data: clusters,
      meta: { total, page: Math.max(1, page), limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  async findOneCluster(id: string, organizationId: string) {
    const cluster = await this.prisma.newsCluster.findFirst({
      where: { id, organizationId },
      include: {
        newsItems: {
          where: { organizationId },
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!cluster) {
      throw new NotFoundException('Cluster not found');
    }

    return cluster;
  }

  // ─── One-click Draft (NEWS-010) ────────────────────────────────────────────

  async createDraftFromItem(id: string, userId: string, organizationId: string) {
    const newsItem = await this.prisma.newsItem.findFirst({
      where: { id, organizationId },
    });

    if (!newsItem) {
      throw new NotFoundException('News item not found');
    }

    if (newsItem.articleId) {
      throw new BadRequestException('This news item already has a draft article');
    }

    const slug = await this.generateSlug(newsItem.title, organizationId);
    const content = newsItem.content ?? '';
    const wordCount = this.countWords(content);
    const readingTime = Math.ceil(wordCount / 200);

    const article = await this.prisma.article.create({
      data: {
        organizationId,
        primaryAuthorId: userId,
        title: newsItem.title,
        slug,
        excerpt: newsItem.excerpt,
        content,
        wordCount,
        readingTime,
        status: ArticleStatus.DRAFT,
        isAiAssisted: false,
        sourceUrl: newsItem.url,
        sourceName: newsItem.sourceName,
        newsItemId: newsItem.id,
        language: newsItem.language,
      },
    });

    await this.prisma.newsItem.update({
      where: { id: newsItem.id },
      data: { status: NewsItemStatus.DRAFTED, articleId: article.id },
    });

    this.eventEmitter.emit('news.draft_created', {
      newsItemId: newsItem.id,
      articleId: article.id,
      organizationId,
      userId,
    });

    return article;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async generateSlug(input: string, organizationId: string): Promise<string> {
    const base = slugify(input, {
      lower: true,
      strict: true,
      trim: true,
    }).substring(0, 480);

    let slug = base;
    let counter = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.article.findFirst({
        where: { organizationId, slug, deletedAt: null },
      });

      if (!existing) break;
      slug = `${base}-${counter++}`;
    }

    return slug;
  }

  private countWords(content: string): number {
    return content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean).length;
  }
}
