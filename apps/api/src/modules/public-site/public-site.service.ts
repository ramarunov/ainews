import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleStatus } from '@prisma/client';

import { ArticlesService } from '../articles/articles.service';
import { PublicArticlesQueryDto } from './dto/public-articles-query.dto';

@Injectable()
export class PublicSiteService {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Single-tenant by design (see docs/PRD.md's SEO/GEO requirements vs. no
   * documented multi-tenant routing strategy for a public site — subdomain
   * vs. path-prefix vs. custom domain is a product decision left for a
   * later, deliberate pass, not guessed at here). One organization's
   * published content is public; which one is a deploy-time config choice.
   */
  private getPublicOrgId(): string {
    const orgId = this.config.get<string>('PUBLIC_SITE_ORG_ID', '');
    if (!orgId) {
      throw new NotFoundException('Public site is not configured');
    }
    return orgId;
  }

  async listPublished(query: PublicArticlesQueryDto) {
    return this.articlesService.findAll(
      { ...query, status: ArticleStatus.PUBLISHED, sortBy: 'publishedAt', sortOrder: 'desc' },
      this.getPublicOrgId(),
    );
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
}
