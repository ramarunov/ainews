import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
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
    const orgId = this.config.get<string>('PUBLIC_SITE_ORG_ID', '');
    if (!orgId) {
      throw new NotFoundException('Public site is not configured');
    }
    return orgId;
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

    if (query.excludeId) {
      return {
        ...result,
        data: (result.data as Array<{ id: string }>)
          .filter((article) => article.id !== query.excludeId)
          .slice(0, requestedLimit),
      };
    }

    return result;
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

    return article;
  }

  async listCategories() {
    const result = await this.categoriesService.findAll(
      { flat: true, limit: 100 },
      this.getPublicOrgId(),
    );
    return result.data;
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
    return this.searchService.search(
      q,
      this.getPublicOrgId(),
      { status: ArticleStatus.PUBLISHED },
      page,
      limit,
    );
  }

  async getPublicSettings() {
    return this.settingsService.list(this.getPublicOrgId(), true);
  }
}
