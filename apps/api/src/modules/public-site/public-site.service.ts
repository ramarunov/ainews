import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { getPublicSiteOrgId } from '../../common/config/public-site-org.util';
import { ArticlesService } from '../articles/articles.service';
import { CategoriesService } from '../categories/categories.service';
import { SearchService } from '../search/search.service';
import { SettingsService } from '../settings/settings.service';
import { PublicArticlesQueryDto } from './dto/public-articles-query.dto';

@Injectable()
export class PublicSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articlesService: ArticlesService,
    private readonly categoriesService: CategoriesService,
    private readonly searchService: SearchService,
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Single-tenant by design (see docs/PRD.md's SEO/GEO requirements vs. no
   * documented multi-tenant routing strategy for a public site — subdomain
   * vs. path-prefix vs. custom domain is a product decision left for a
   * later, deliberate pass, not guessed at here). One organization's
   * published content is public; which one is a deploy-time config choice.
   */
  getPublicOrgId(): string {
    return getPublicSiteOrgId(this.config);
  }

  async listPublished(query: PublicArticlesQueryDto) {
    const organizationId = this.getPublicOrgId();

    let categoryId: string | undefined;
    if (query.categorySlug) {
      const category = await this.categoriesService.findBySlug(query.categorySlug, organizationId);
      categoryId = category.id;
    }

    const requestedLimit = query.limit ?? 20;
    // Fetch one extra when excluding an id (e.g. "related articles" for the
    // article currently being read) so filtering it out still leaves a full
    // page, rather than quietly returning one short.
    const fetchLimit = query.excludeId ? requestedLimit + 1 : requestedLimit;

    const result = await this.articlesService.findAll(
      {
        status: ArticleStatus.PUBLISHED,
        categoryId,
        authorId: query.authorId,
        isBreaking: query.isBreaking,
        isFeatured: query.isFeatured,
        search: query.search,
        page: query.page,
        limit: fetchLimit,
        sortBy: query.sortBy ?? 'publishedAt',
        sortOrder: 'desc',
      },
      organizationId,
    );

    type ResultArticle = { id: string; primaryCategory?: { isActive: boolean } | null };

    if (query.excludeId) {
      return {
        ...result,
        data: (result.data as ResultArticle[])
          .filter((article) => article.id !== query.excludeId)
          .filter((article) => article.primaryCategory?.isActive !== false)
          .slice(0, requestedLimit),
      };
    }

    // Same reasoning as findPublishedBySlug()/listCategories(): an inactive
    // category's articles must not surface on public listings either. Not
    // padded like the excludeId branch above - inactive categories are rare
    // enough that a slightly-short page here is an acceptable trade-off
    // versus the complexity of re-querying to keep pagination exact.
    return {
      ...result,
      data: (result.data as ResultArticle[]).filter(
        (article) => article.primaryCategory?.isActive !== false,
      ),
    };
  }

  async findPublishedBySlug(slug: string) {
    const article = await this.articlesService.findBySlug(slug, this.getPublicOrgId());

    // findBySlug() doesn't filter by status — it's shared with the
    // authenticated editor UI, which legitimately previews drafts by slug.
    // The public site must never expose an unpublished article just
    // because its slug is guessable.
    if (article.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException(`Article with slug "${slug}" not found`);
    }

    // Same reasoning as listCategories()'s isActive filter: an article
    // whose primary category has been deactivated must not stay reachable
    // by slug just because the article row itself is still PUBLISHED.
    if (article.primaryCategory && !article.primaryCategory.isActive) {
      throw new NotFoundException(`Article with slug "${slug}" not found`);
    }

    return article;
  }

  async listCategories() {
    const result = await this.categoriesService.findAll(
      { flat: true, limit: 100 },
      this.getPublicOrgId(),
    );
    // findAll() is shared with the authenticated CMS category list, which
    // legitimately needs to see inactive categories to re-enable them -
    // the public listing must not, since this is also what drives
    // hostname-to-category resolution (apps/web/proxy.ts) and per-host
    // rendering. An inactive category disappearing from here is what makes
    // its subdomain/articles publicly unreachable.
    return result.data.filter((category) => category.isActive !== false);
  }

  async getAuthorProfile(id: string) {
    const author = await this.prisma.user.findFirst({
      where: { id, organizationId: this.getPublicOrgId(), deletedAt: null, isActive: true },
      select: { id: true, displayName: true, firstName: true, lastName: true, avatarUrl: true, bio: true },
    });

    if (!author) {
      throw new NotFoundException('Author not found');
    }

    return author;
  }

  async search(q: string, page = 1, limit = 20) {
    const result = await this.searchService.search(
      q,
      this.getPublicOrgId(),
      { status: ArticleStatus.PUBLISHED },
      page,
      limit,
    );

    // Same reasoning as listPublished()/listCategories(): an inactive
    // category's articles must not be surfaced to public search either.
    type ResultArticle = { primaryCategory?: { isActive: boolean } | null };
    return {
      ...result,
      data: (result.data as ResultArticle[]).filter(
        (article) => article.primaryCategory?.isActive !== false,
      ),
    };
  }

  async getPublicSettings() {
    return this.settingsService.list(this.getPublicOrgId(), true);
  }
}
