import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticleStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { getPublicSiteOrgId } from '../../common/config/public-site-org.util';
import { ArticlesService } from '../articles/articles.service';
import { CategoriesService } from '../categories/categories.service';
import { PagesService } from '../pages/pages.service';
import { SearchService } from '../search/search.service';
import { SettingsService } from '../settings/settings.service';
import { TagsService } from '../tags/tags.service';
import { PublicArticlesQueryDto } from './dto/public-articles-query.dto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PublicSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articlesService: ArticlesService,
    private readonly categoriesService: CategoriesService,
    private readonly pagesService: PagesService,
    private readonly searchService: SearchService,
    private readonly settingsService: SettingsService,
    private readonly tagsService: TagsService,
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
    let primaryCategoryIds: string[] | undefined;
    if (query.categorySlug) {
      const category = await this.categoriesService.findBySlug(query.categorySlug, organizationId);
      // A category with active subcategories is a topic hub - its own page
      // rolls up articles assigned directly to it AND to any of its
      // subcategories, rather than only exact-matching primaryCategoryId.
      // Only one level deep (subcategories don't themselves have children).
      const activeChildren = category.children?.filter((c) => c.isActive !== false) ?? [];
      if (activeChildren.length > 0) {
        primaryCategoryIds = [category.id, ...activeChildren.map((c) => c.id)];
      } else {
        categoryId = category.id;
      }
    }

    let tagId: string | undefined;
    if (query.tagSlug) {
      const tag = await this.tagsService.findBySlug(query.tagSlug, organizationId);
      tagId = tag.id;
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
        primaryCategoryIds,
        tagId,
        authorId: query.authorId,
        isBreaking: query.isBreaking,
        isFeatured: query.isFeatured,
        search: query.search,
        // Default to the Indonesian edition; the /en/* routes pass 'en'.
        language: query.language ?? 'id',
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

  async findPublishedBySlug(slug: string, language?: string) {
    const lang = language === 'en' ? 'en' : language === 'id' ? 'id' : undefined;
    const article = await this.articlesService.findBySlug(slug, this.getPublicOrgId(), lang);

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

    // Flatten the translation pairing into { id, en } slug map for the
    // public site to build hreflang tags. Each side points at its
    // PUBLISHED counterpart (self included); missing = no alternate.
    const { translationParent, translations, ...rest } = article as typeof article & {
      translationParent?: { slug: string; language: string; status: ArticleStatus } | null;
      translations?: Array<{ slug: string; language: string; status: ArticleStatus }>;
    };
    const hreflang: { id?: string; en?: string } = {
      [article.language === 'en' ? 'en' : 'id']: article.slug,
    };
    for (const t of [translationParent, ...(translations ?? [])]) {
      if (t && t.status === ArticleStatus.PUBLISHED && (t.language === 'id' || t.language === 'en')) {
        hreflang[t.language] = t.slug;
      }
    }

    // Flatten the author's English E-E-A-T overrides out of the free-form
    // metadata bag (same shape getAuthorProfile() reads) so the /en/ author
    // box can show an English bio/job title. Raw metadata isn't exposed.
    const primaryAuthor = (rest as { primaryAuthor?: { metadata?: unknown } }).primaryAuthor;
    if (primaryAuthor) {
      const profile = ((primaryAuthor.metadata as any) ?? {}).authorProfile ?? {};
      delete (primaryAuthor as { metadata?: unknown }).metadata;
      Object.assign(primaryAuthor, {
        bioEn: typeof profile.bioEn === 'string' ? profile.bioEn : null,
        jobTitle: typeof profile.jobTitle === 'string' ? profile.jobTitle : null,
        jobTitleEn: typeof profile.jobTitleEn === 'string' ? profile.jobTitleEn : null,
      });
    }

    return { ...rest, hreflang };
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

  async listPages() {
    const result = await this.pagesService.findAll({ limit: 100 }, this.getPublicOrgId());
    // Same reasoning as listCategories()'s isActive filter: an unpublished
    // page is a draft an admin is still writing, not something to list on
    // the public site (e.g. in the footer) or resolve by slug below.
    return result.data.filter((page) => page.isPublished);
  }

  async getPublishedPageBySlug(slug: string) {
    const page = await this.pagesService.findBySlug(slug, this.getPublicOrgId());

    if (!page.isPublished) {
      throw new NotFoundException(`Page with slug "${slug}" not found`);
    }

    return page;
  }

  async getPublicTagBySlug(slug: string) {
    return this.tagsService.findBySlug(slug, this.getPublicOrgId());
  }

  // Accepts either the author's slug (/author/{slug}, the current URL shape
  // - see UsersService.generateSlug) or their raw id (the URL shape before
  // slugs existed, or for a user created before slug backfill ran - see
  // apps/api/scripts/backfill-user-slugs.ts) so neither an old link nor a
  // not-yet-backfilled author's URL breaks.
  async getAuthorProfile(idOrSlug: string) {
    const isUuid = UUID_PATTERN.test(idOrSlug);
    const author = await this.prisma.user.findFirst({
      where: {
        organizationId: this.getPublicOrgId(),
        deletedAt: null,
        isActive: true,
        OR: isUuid ? [{ id: idOrSlug }, { slug: idOrSlug }] : [{ slug: idOrSlug }],
      },
      select: {
        id: true,
        slug: true,
        displayName: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        bio: true,
        metadata: true,
      },
    });

    if (!author) {
      throw new NotFoundException('Author not found');
    }

    // Flatten the E-E-A-T author fields out of the free-form metadata bag
    // (see /account profile editor) so the public site doesn't have to know
    // the storage shape. Nothing else from `metadata` is exposed.
    const profile = ((author.metadata as any) ?? {}).authorProfile ?? {};
    const { metadata: _drop, ...rest } = author;
    return {
      ...rest,
      jobTitle: typeof profile.jobTitle === 'string' ? profile.jobTitle : null,
      jobTitleEn: typeof profile.jobTitleEn === 'string' ? profile.jobTitleEn : null,
      bioEn: typeof profile.bioEn === 'string' ? profile.bioEn : null,
      sameAs: Array.isArray(profile.sameAs)
        ? profile.sameAs.filter((x: unknown) => typeof x === 'string' && x)
        : [],
      knowsAbout: Array.isArray(profile.knowsAbout)
        ? profile.knowsAbout.filter((x: unknown) => typeof x === 'string' && x)
        : [],
    };
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
    // Includes `site.publisher` (editorial-transparency data) - it's a
    // normal public Setting, edited under Site Settings -> Editorial
    // transparency, and consumed by the homepage's NewsMediaOrganization
    // JSON-LD.
    return this.settingsService.list(this.getPublicOrgId(), true);
  }
}
