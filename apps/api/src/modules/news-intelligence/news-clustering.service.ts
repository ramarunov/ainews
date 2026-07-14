import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AIWriterService } from '../ai/ai-writer.service';

const CLUSTER_WINDOW_DAYS = 7;
const MAX_CANDIDATE_CLUSTERS = 50;
const SIMILARITY_THRESHOLD = 0.3;
const ENTITY_WEIGHT = 0.6;
const TITLE_WEIGHT = 0.4;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'are',
  'was', 'were', 'will', 'would', 'could', 'should', 'about', 'into', 'over',
  'after', 'before', 'their', 'they', 'them', 'says', 'said', 'more', 'than',
]);

interface ExtractedEntity {
  text: string;
  type: string;
  confidence: number;
}

/**
 * Story clustering (NEWS-005) + entity extraction (NEWS-007) - both P0,
 * and both were a hard zero before this: NewsItem.entities and
 * NewsCluster existed in the schema (apparently designed upfront) but
 * nothing anywhere ever populated either.
 *
 * Clustering is a deterministic Jaccard-similarity heuristic over
 * extracted entities + title tokens, NOT an embedding/vector search - no
 * vector column exists on NewsItem, and unlike AI Writer's "nice to have"
 * tools, clustering is a P0 requirement that must keep working even when
 * no AI provider key is configured. Entity extraction is AI-backed (real
 * NER is impractical to hand-roll) and degrades to an empty entity list on
 * failure, at which point clustering falls back to title-similarity alone
 * rather than throwing.
 */
@Injectable()
export class NewsClusteringService {
  private readonly logger = new Logger(NewsClusteringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiWriter: AIWriterService,
  ) {}

  async processItem(newsItemId: string, organizationId: string): Promise<void> {
    const item = await this.prisma.newsItem.findFirst({
      where: { id: newsItemId, organizationId },
    });
    if (!item) return;

    const entities = await this.extractEntitiesSafely(item.title, item.content ?? item.excerpt ?? '');

    const since = new Date(Date.now() - CLUSTER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.newsCluster.findMany({
      where: { organizationId, lastUpdatedAt: { gte: since } },
      orderBy: { lastUpdatedAt: 'desc' },
      take: MAX_CANDIDATE_CLUSTERS,
    });

    const titleTokens = this.tokenize(item.title);
    const entityTexts = new Set(entities.map((e) => e.text.toLowerCase()));

    let best: { id: string; entities: unknown; score: number } | null = null;
    for (const cluster of candidates) {
      const clusterEntities = new Set(
        (Array.isArray(cluster.entities) ? (cluster.entities as any[]) : []).map((e: any) =>
          String(e?.text ?? e).toLowerCase(),
        ),
      );
      const clusterTitleTokens = this.tokenize(cluster.title ?? '');
      const titleScore = this.jaccard(titleTokens, clusterTitleTokens);
      // With no entities on either side (no AI key configured, or this
      // particular item/cluster just has none), judge on title overlap
      // alone rather than diluting it through an entity weight that has
      // no signal to contribute - a weighted score capped at TITLE_WEIGHT
      // would make even a near-identical title fail to cluster.
      const hasEntitySignal = entityTexts.size > 0 && clusterEntities.size > 0;
      const score = hasEntitySignal
        ? this.jaccard(entityTexts, clusterEntities) * ENTITY_WEIGHT + titleScore * TITLE_WEIGHT
        : titleScore;

      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { id: cluster.id, entities: cluster.entities, score };
      }
    }

    if (best) {
      const mergedEntities = this.mergeEntities(best.entities, entities);
      await this.prisma.newsCluster.update({
        where: { id: best.id },
        data: {
          itemCount: { increment: 1 },
          lastUpdatedAt: new Date(),
          entities: mergedEntities as any,
          trendScore: { increment: 1 },
        },
      });
      await this.prisma.newsItem.update({
        where: { id: item.id },
        data: { clusterId: best.id, entities: entities as any },
      });
    } else {
      const cluster = await this.prisma.newsCluster.create({
        data: {
          organizationId,
          title: item.title,
          entities: entities as any,
          itemCount: 1,
          trendScore: 1,
        },
      });
      await this.prisma.newsItem.update({
        where: { id: item.id },
        data: { clusterId: cluster.id, entities: entities as any },
      });
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async extractEntitiesSafely(title: string, body: string): Promise<ExtractedEntity[]> {
    try {
      return await this.aiWriter.extractEntities(`${title}\n${body}`);
    } catch (err) {
      this.logger.warn(
        `Entity extraction failed - clustering will fall back to title-only similarity: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private mergeEntities(existing: unknown, incoming: ExtractedEntity[]): ExtractedEntity[] {
    const existingList = Array.isArray(existing) ? (existing as ExtractedEntity[]) : [];
    const seen = new Map(existingList.map((e) => [e.text.toLowerCase(), e]));
    for (const entity of incoming) {
      if (!seen.has(entity.text.toLowerCase())) {
        seen.set(entity.text.toLowerCase(), entity);
      }
    }
    return [...seen.values()];
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 3 && !STOPWORDS.has(word)),
    );
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const value of a) {
      if (b.has(value)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
