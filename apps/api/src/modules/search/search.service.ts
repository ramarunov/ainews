import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Client } from '@opensearch-project/opensearch';
import { ArticleStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OPENSEARCH_CLIENT } from '../../infrastructure/opensearch/opensearch.module';

const ARTICLES_INDEX = 'articles';

interface SearchFilters {
  categoryId?: string;
  tagId?: string;
  authorId?: string;
  status?: string;
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(OPENSEARCH_CLIENT) private readonly opensearch: Client,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Indexing ──────────────────────────────────────────────────────────────

  async indexArticle(article: any) {
    try {
      const tagNames =
        article.articleTags?.map((at: any) => at.tag?.name).filter(Boolean) ?? [];
      const tagIds =
        article.articleTags?.map((at: any) => at.tagId).filter(Boolean) ?? [];

      await this.opensearch.index({
        index: ARTICLES_INDEX,
        id: article.id,
        body: {
          organizationId: article.organizationId,
          title: article.title,
          subtitle: article.subtitle,
          excerpt: article.excerpt,
          content: this.stripHtml(article.content ?? ''),
          slug: article.slug,
          status: article.status,
          categoryId: article.primaryCategoryId,
          authorId: article.primaryAuthorId,
          tags: tagNames,
          tagIds,
          publishedAt: article.publishedAt,
          createdAt: article.createdAt,
          updatedAt: article.updatedAt,
          language: article.language,
        },
        refresh: true,
      });
    } catch (error) {
      console.error(`[SearchService] Failed to index article ${article?.id}`, error);
    }
  }

  async removeFromIndex(articleId: string) {
    try {
      await this.opensearch.delete({ index: ARTICLES_INDEX, id: articleId });
    } catch (error: any) {
      const statusCode = error?.meta?.statusCode ?? error?.statusCode;
      if (statusCode !== 404) {
        console.error(`[SearchService] Failed to remove article ${articleId} from index`, error);
      }
    }
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  async search(
    query: string,
    organizationId: string,
    filters: SearchFilters,
    page = 1,
    limit = 20,
  ) {
    const take = Math.min(100, Math.max(1, limit));
    const from = (Math.max(1, page) - 1) * take;

    try {
      // These fields are dynamically mapped by OpenSearch as analyzed `text`
      // (with a `.keyword` sub-field) since no explicit index mapping is
      // created. A `term` query against the bare field name matches
      // individual analyzed tokens, not the original string — for a UUID
      // like organizationId that means it never matches anything, silently
      // zeroing out every search result. Query the `.keyword` sub-field for
      // exact-value filters instead.
      const filterClauses: any[] = [
        { term: { 'organizationId.keyword': organizationId } },
      ];
      if (filters.categoryId)
        filterClauses.push({ term: { 'categoryId.keyword': filters.categoryId } });
      if (filters.tagId) filterClauses.push({ term: { 'tagIds.keyword': filters.tagId } });
      if (filters.authorId)
        filterClauses.push({ term: { 'authorId.keyword': filters.authorId } });
      if (filters.status) filterClauses.push({ term: { 'status.keyword': filters.status } });

      const response = await this.opensearch.search({
        index: ARTICLES_INDEX,
        body: {
          from,
          size: take,
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query,
                    fields: ['title^3', 'subtitle^2', 'excerpt', 'content'],
                  },
                },
              ],
              filter: filterClauses,
            },
          },
        },
      });

      const hits = response.body.hits;
      const total =
        typeof hits.total === 'object' ? hits.total.value : (hits.total ?? hits.hits.length);

      return {
        data: hits.hits.map((hit: any) => ({ id: hit._id, score: hit._score, ...hit._source })),
        meta: { total, page: Math.max(1, page), limit: take },
      };
    } catch (error) {
      console.error('[SearchService] OpenSearch query failed, falling back to database search', error);
      return this.fallbackSearch(query, organizationId, filters, page, take);
    }
  }

  async autocomplete(prefix: string, organizationId: string, limit = 10) {
    const take = Math.min(50, Math.max(1, limit));

    try {
      const response = await this.opensearch.search({
        index: ARTICLES_INDEX,
        body: {
          size: take,
          query: {
            bool: {
              must: [{ match_phrase_prefix: { title: prefix } }],
              filter: [{ term: { 'organizationId.keyword': organizationId } }],
            },
          },
          _source: ['title', 'slug'],
        },
      });

      return response.body.hits.hits.map((hit: any) => ({
        id: hit._id,
        title: hit._source.title,
        slug: hit._source.slug,
      }));
    } catch (error) {
      console.error('[SearchService] OpenSearch autocomplete failed, falling back to database', error);
      return this.fallbackAutocomplete(prefix, organizationId, take);
    }
  }

  // ─── Event Listeners ───────────────────────────────────────────────────────

  @OnEvent('article.created')
  async handleArticleCreated(payload: { articleId: string; organizationId: string }) {
    const article = await this.fetchArticleForIndex(payload.articleId, payload.organizationId);
    if (article) await this.indexArticle(article);
  }

  @OnEvent('article.updated')
  async handleArticleUpdated(payload: { articleId: string; organizationId: string }) {
    const article = await this.fetchArticleForIndex(payload.articleId, payload.organizationId);
    if (article) await this.indexArticle(article);
  }

  @OnEvent('article.deleted')
  async handleArticleDeleted(payload: { articleId: string }) {
    await this.removeFromIndex(payload.articleId);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async fetchArticleForIndex(articleId: string, organizationId: string) {
    return this.prisma.article.findFirst({
      where: { id: articleId, organizationId },
      include: {
        articleTags: {
          include: { tag: { select: { id: true, name: true } } },
        },
      },
    });
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async fallbackSearch(
    query: string,
    organizationId: string,
    filters: SearchFilters,
    page: number,
    limit: number,
  ) {
    const skip = (Math.max(1, page) - 1) * limit;

    const where: Prisma.ArticleWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters.status && { status: filters.status as ArticleStatus }),
      ...(filters.authorId && { primaryAuthorId: filters.authorId }),
      ...(filters.categoryId && { primaryCategoryId: filters.categoryId }),
      ...(filters.tagId && { articleTags: { some: { tagId: filters.tagId } } }),
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { excerpt: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ],
    };

    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.article.count({ where }),
    ]);

    return {
      data: articles,
      meta: { total, page: Math.max(1, page), limit },
    };
  }

  private async fallbackAutocomplete(prefix: string, organizationId: string, limit: number) {
    const articles = await this.prisma.article.findMany({
      where: {
        organizationId,
        deletedAt: null,
        title: { contains: prefix, mode: 'insensitive' },
      },
      select: { id: true, title: true, slug: true },
      take: limit,
      orderBy: { title: 'asc' },
    });

    return articles;
  }
}
