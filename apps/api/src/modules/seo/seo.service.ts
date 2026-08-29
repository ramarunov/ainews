import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AIGatewayService } from '../ai/ai-gateway.service';
import { AIWriterService } from '../ai/ai-writer.service';
import { getArticleUrl, getRootDomain } from '../../common/url/site-url.util';

export interface SeoData {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl?: string;
  twitterCard: string;
  schemaJsonld: object;
  focusKeyword?: string;
  seoScore: number;
}

// Shared by generateSeoData/generateArticleSchema - every field but
// title/slug is optional since the manual `/seo/schema/article` endpoint
// only ever has title/slug/siteUrl/excerpt to work with, while the
// article.published event handler below has the full article record.
export interface ArticleSchemaInput {
  title: string;
  content?: string;
  excerpt?: string;
  slug: string;
  primaryCategory?: {
    name?: string;
    slug: string;
    subdomain?: string | null;
    parent?: { subdomain?: string | null } | null;
  } | null;
  featuredImageUrl?: string;
  featuredImageWidth?: number;
  featuredImageHeight?: number;
  author?: {
    id?: string;
    slug?: string | null;
    displayName: string;
    // E-E-A-T author signals (stored on user.metadata.authorProfile).
    jobTitle?: string;
    sameAs?: string[];
  };
  publishedAt?: Date;
  updatedAt?: Date;
  tags?: string[];
  wordCount?: number;
  language?: string;
  // GEO engine output (article_geo), when available - see
  // GeoService.calculateGeoScore.
  geoSummary?: string;
  geoEntities?: string[];
}

// Publisher-level E-E-A-T / editorial-transparency signals Google News and
// Discover look for on NewsMediaOrganization. Sourced from
// organization.settings.publisher.
export interface PublisherInfo {
  name: string;
  logoUrl?: string | null;
  sameAs?: string[];
  ethicsPolicyUrl?: string;
  correctionsPolicyUrl?: string;
  diversityPolicyUrl?: string;
  foundingDate?: string;
}

export interface SeoScoreBreakdown {
  total: number;
  details: {
    keywordInTitle: number;
    keywordInFirstParagraph: number;
    keywordDensity: number;
    metaDescription: number;
    headingStructure: number;
    wordCount: number;
    internalLinks: number;
    imageAltText: number;
    urlStructure: number;
    schemaMarkup: number;
    readability: number;
  };
  recommendations: string[];
}

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AIGatewayService,
    private readonly aiWriter: AIWriterService,
    private readonly eventEmitter: EventEmitter2,
    // Optional (tests instantiate this service with only the four
    // collaborators above) - only needed to resolve ROOT_DOMAIN for the
    // category-subdomain canonical-URL branch in buildCanonicalUrl().
    private readonly config?: ConfigService,
  ) {}

  // ─── Generate Full SEO Package ─────────────────────────────────────────────

  async generateSeoData(
    articleId: string,
    article: ArticleSchemaInput & { content: string },
    siteUrl: string,
    focusKeyword?: string,
    organization?: PublisherInfo,
  ): Promise<SeoData> {
    // Each piece degrades independently rather than via a single Promise.all
    // - the AI-backed meta title/description calls can fail on their own
    // (AI services disabled, provider outage) without also losing the
    // schema.org JSON-LD below, which needs no AI at all. Before this fix,
    // one AI failure silently aborted the entire SEO package, meaning a
    // fresh install with AI services off would never get structured data
    // on any article, ever - not just a degraded meta title.
    const [metaTitle, metaDescription, schema] = await Promise.all([
      this.generateMetaTitle(article.title, focusKeyword).catch(() =>
        article.title.substring(0, SeoService.META_TITLE_MAX),
      ),
      this.aiWriter
        .generateMetaDescription(article.content, focusKeyword, article.language)
        .catch(() => (article.excerpt ?? article.content.replace(/<[^>]+>/g, ' ')).trim().substring(0, 160)),
      this.generateArticleSchema(article, siteUrl, organization),
    ]);

    const canonicalUrl = this.buildCanonicalUrl(siteUrl, article.slug, article.primaryCategory);
    const seoScore = this.calculateSeoScore(article.content, article.title, {
      metaTitle,
      metaDescription,
      focusKeyword,
      slug: article.slug,
      hasSchema: true,
    });

    return {
      metaTitle,
      metaDescription,
      canonicalUrl,
      robots: 'index,follow',
      ogTitle: metaTitle,
      ogDescription: metaDescription,
      ogImageUrl: article.featuredImageUrl,
      twitterCard: 'summary_large_image',
      schemaJsonld: schema,
      focusKeyword,
      seoScore: seoScore.total,
    };
  }

  // ─── Meta Title Generation ─────────────────────────────────────────────────

  // The public site's <title> tag always gets " — RusdiMedia.com" (17 chars)
  // appended by the frontend's sitewide title template (apps/web's
  // app/(public)/layout.tsx) - a metaTitle generated all the way up to
  // Google's ~60-char display budget left no room for that suffix, so it
  // routinely got truncated in search results, losing the branding it was
  // meant to add. Reserving that width here keeps the *rendered* title
  // (this value + the suffix) inside the real budget.
  private static readonly SITE_SUFFIX_RESERVE = 17;
  private static readonly META_TITLE_MAX =
    60 - SeoService.SITE_SUFFIX_RESERVE;

  async generateMetaTitle(title: string, focusKeyword?: string): Promise<string> {
    if (title.length <= SeoService.META_TITLE_MAX) {
      return title;
    }

    const result = await this.aiGateway.prompt(
      `You are an SEO specialist. Create an SEO-optimized meta title.
Rules: ${SeoService.META_TITLE_MAX} characters max. Include focus keyword if provided.
Return ONLY the title text, no quotes or explanation.`,
      `Original title: ${title}${focusKeyword ? `\nFocus keyword: ${focusKeyword}` : ''}`,
      { temperature: 0.3, maxTokens: 100 },
    );

    return result.trim().replace(/^["']|["']$/g, '').substring(0, SeoService.META_TITLE_MAX);
  }

  // ─── Schema.org JSON-LD Generation ─────────────────────────────────────────

  async generateArticleSchema(
    article: ArticleSchemaInput,
    siteUrl: string,
    organization?: PublisherInfo,
  ): Promise<object> {
    const url = this.buildCanonicalUrl(siteUrl, article.slug, article.primaryCategory);
    const rootUrl = siteUrl.replace(/\/$/, '');

    const schema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: article.title,
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      // A blank description here isn't just a cosmetic gap - Google's
      // structured-data guidelines call out description as expected on
      // NewsArticle, and article.excerpt is genuinely absent on plenty of
      // articles (nothing requires editors to fill it in). Same
      // strip-tags-and-truncate fallback already used for metaDescription
      // above when the AI call fails, applied here unconditionally rather
      // than only on failure, since this function never calls the AI at all.
      // The GEO engine's machine-readable summary is written specifically
      // to be extracted and cited by AI search - a strictly better
      // NewsArticle description than a truncated excerpt when it exists.
      description:
        article.geoSummary ||
        article.excerpt ||
        article.content?.replace(/<[^>]+>/g, ' ').trim().substring(0, 160) ||
        '',
      ...(article.geoSummary && { abstract: article.geoSummary }),
      // Entities the article actually covers (people, orgs, places,
      // events), from the GEO analysis - `about` is what tells an AI/search
      // engine what this article IS about, distinct from `keywords`.
      ...(article.geoEntities?.length && {
        about: article.geoEntities.slice(0, 12).map((name) => ({ '@type': 'Thing', name })),
      }),
      datePublished: article.publishedAt?.toISOString(),
      // Falls back to publishedAt when updatedAt isn't available (e.g. the
      // manual schema/article endpoint, which has no article record) -
      // never the moment this function happens to run, which would silently
      // drift from the article's real edit history.
      dateModified: (article.updatedAt ?? article.publishedAt)?.toISOString(),
      // Every article on this site is freely readable (no paywall) -
      // declaring this explicitly is Google News' own recommendation for
      // avoiding a false "paywalled" classification.
      isAccessibleForFree: true,
      // Marks which parts of the rendered page are the best candidates for
      // a voice assistant/AI to read aloud or excerpt - the headline
      // (`article h1`, always present - see news/[slug]/page.tsx) and, when
      // the article has a dek, its subtitle (`data-speakable="summary"`).
      // A selector matching zero elements on a given article (no subtitle)
      // is harmless, not an error.
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['article h1', '[data-speakable="summary"]'],
      },
      articleSection: article.primaryCategory?.name,
      keywords: article.tags?.length ? article.tags.join(', ') : undefined,
      wordCount: article.wordCount,
      inLanguage: article.language,
      author: article.author
        ? {
            '@type': 'Person',
            name: article.author.displayName,
            // Links the Person entity back to its profile page (Person
            // schema there too - see AuthorPage) rather than a bare name,
            // which is what Google's E-E-A-T guidance actually wants: an
            // identifiable, dereferenceable author, not just a string.
            // Prefer the slug (the canonical /author URL); the id still
            // resolves but 301s to the slug.
            url:
              article.author.slug || article.author.id
                ? `${rootUrl}/author/${article.author.slug || article.author.id}`
                : undefined,
            jobTitle: article.author.jobTitle,
            worksFor: organization
              ? { '@type': 'NewsMediaOrganization', name: organization.name }
              : undefined,
            // Off-site profiles that corroborate this is a real, identifiable
            // person - a core E-E-A-T "authoritativeness" signal.
            sameAs: article.author.sameAs?.length ? article.author.sameAs : undefined,
          }
        : undefined,
      image: article.featuredImageUrl
        ? {
            '@type': 'ImageObject',
            url: article.featuredImageUrl,
            width: article.featuredImageWidth,
            height: article.featuredImageHeight,
          }
        : undefined,
      publisher: organization
        ? {
            // NewsMediaOrganization (a schema.org subtype of Organization)
            // is Google's documented, more specific type for a news
            // publisher's own entity - a plain Organization still validates
            // but doesn't carry that extra "this is a news publisher"
            // signal for News/Discover surfaces.
            '@type': 'NewsMediaOrganization',
            name: organization.name,
            url: `${rootUrl}/about`,
            logo: organization.logoUrl
              ? { '@type': 'ImageObject', url: organization.logoUrl }
              : undefined,
            // Editorial-transparency properties Google News documents for
            // NewsMediaOrganization - sourced from
            // organization.settings.publisher, so they only appear once an
            // admin has actually filled them in.
            sameAs: organization.sameAs?.length ? organization.sameAs : undefined,
            ethicsPolicy: organization.ethicsPolicyUrl,
            correctionsPolicy: organization.correctionsPolicyUrl,
            diversityPolicy: organization.diversityPolicyUrl,
            foundingDate: organization.foundingDate,
          }
        : undefined,
    };

    // Remove undefined values (top-level and one level into nested objects)
    const prune = (obj: Record<string, any>) =>
      Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
    prune(schema);
    if (schema.author) prune(schema.author);
    if (schema.image) prune(schema.image);
    if (schema.publisher) prune(schema.publisher);

    return schema;
  }

  async generateFaqSchema(
    faqs: Array<{ question: string; answer: string }>,
  ): Promise<object> {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };
  }

  // ─── SEO Score Calculator ──────────────────────────────────────────────────

  calculateSeoScore(
    content: string,
    title: string,
    options: {
      metaTitle?: string;
      metaDescription?: string;
      focusKeyword?: string;
      slug?: string;
      hasSchema?: boolean;
    },
  ): SeoScoreBreakdown {
    const text = content.replace(/<[^>]+>/g, ' ').toLowerCase();
    const keyword = options.focusKeyword?.toLowerCase() ?? '';
    const recommendations: string[] = [];
    const details = {
      keywordInTitle: 0,
      keywordInFirstParagraph: 0,
      keywordDensity: 0,
      metaDescription: 0,
      headingStructure: 0,
      wordCount: 0,
      internalLinks: 0,
      imageAltText: 0,
      urlStructure: 0,
      schemaMarkup: 0,
      readability: 0,
    };

    // Keyword in title (15 points)
    if (keyword && title.toLowerCase().includes(keyword)) {
      details.keywordInTitle = 15;
    } else if (keyword) {
      recommendations.push(`Include focus keyword "${options.focusKeyword}" in the title`);
    }

    // Keyword in first paragraph (10 points)
    const firstParagraph = text.substring(0, 500);
    if (keyword && firstParagraph.includes(keyword)) {
      details.keywordInFirstParagraph = 10;
    } else if (keyword) {
      recommendations.push(`Use focus keyword in the first paragraph`);
    }

    // Keyword density (10 points)
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (keyword && wordCount > 0) {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const keywordCount = (text.match(new RegExp(escapedKeyword, 'g')) ?? []).length;
      const density = (keywordCount / wordCount) * 100;
      if (density >= 0.5 && density <= 3.0) {
        details.keywordDensity = 10;
      } else if (density > 0 && density < 5) {
        details.keywordDensity = 5;
        recommendations.push(
          `Keyword density is ${density.toFixed(1)}%. Aim for 0.5-3%`,
        );
      } else {
        recommendations.push(
          density === 0
            ? `Include focus keyword in content`
            : `Reduce keyword density (currently ${density.toFixed(1)}%)`,
        );
      }
    }

    // Meta description (10 points)
    const metaDesc = options.metaDescription ?? '';
    if (metaDesc.length >= 120 && metaDesc.length <= 160) {
      details.metaDescription = 10;
    } else if (metaDesc.length > 0) {
      details.metaDescription = 5;
      recommendations.push(`Meta description should be 120-160 characters (currently ${metaDesc.length})`);
    } else {
      recommendations.push('Add a meta description');
    }

    // Heading structure (10 points)
    const h2Count = (content.match(/<h2/gi) ?? []).length;
    if (h2Count >= 2) {
      details.headingStructure = 10;
    } else if (h2Count >= 1) {
      details.headingStructure = 5;
      recommendations.push('Add more H2 subheadings to structure your content');
    } else {
      recommendations.push('Add H2 subheadings to structure your content');
    }

    // Word count (10 points)
    if (wordCount >= 1000) {
      details.wordCount = 10;
    } else if (wordCount >= 600) {
      details.wordCount = 7;
      recommendations.push(`Article has ${wordCount} words. Aim for 1000+ for better rankings`);
    } else if (wordCount >= 300) {
      details.wordCount = 4;
      recommendations.push(`Article is too short (${wordCount} words). Aim for 1000+ words`);
    } else {
      recommendations.push(`Article is very short (${wordCount} words). Expand significantly`);
    }

    // Internal links (10 points) — counted directly from the actual content,
    // same as headingStructure below, rather than an external option nothing
    // ever supplied (this used to always read 0 regardless of real links,
    // including links inserted by the automatic internal-linking feature).
    // A relative href (starts with a single `/`, not `//` - that's a
    // protocol-relative external link) is "internal" regardless of which
    // section of the site it points at (article, category, tag, author,
    // ...) - articles link at a bare `/{slug}` now (see
    // ArticleInternalLinkingService), not the `/news/{slug}` this used to
    // match exclusively on.
    const internalLinks = (content.match(/<a\s[^>]*href=["']\/(?!\/)/gi) ?? []).length;
    if (internalLinks >= 3) {
      details.internalLinks = 10;
    } else if (internalLinks >= 1) {
      details.internalLinks = 5;
      recommendations.push('Add more internal links (aim for 3+)');
    } else {
      recommendations.push('Add internal links to related content');
    }

    // Image alt text (5 points) — same fix as internal links above: counted
    // from the real content instead of external options nothing ever passed.
    const imgTags = content.match(/<img\s[^>]*>/gi) ?? [];
    const totalImages = imgTags.length;
    const altImages = imgTags.filter((tag) => /\salt=["'][^"']+["']/i.test(tag)).length;
    if (totalImages === 0 || altImages === totalImages) {
      details.imageAltText = 5;
    } else {
      details.imageAltText = Math.round((altImages / totalImages) * 5);
      recommendations.push('Add alt text to all images');
    }

    // URL structure (5 points)
    const slug = options.slug ?? '';
    if (slug.length >= 10 && slug.length <= 75 && !slug.match(/[^a-z0-9-]/)) {
      details.urlStructure = 5;
    } else if (slug) {
      details.urlStructure = 3;
      recommendations.push('Optimize URL slug: use only lowercase letters, numbers, and hyphens');
    }

    // Schema markup (10 points)
    if (options.hasSchema) {
      details.schemaMarkup = 10;
    } else {
      recommendations.push('Add structured data (Schema.org) markup');
    }

    // Readability (5 points) — simplified Flesch-Kincaid approximation
    const avgWordLength =
      text.replace(/\s+/g, '').length / Math.max(wordCount, 1);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgSentenceLength = wordCount / Math.max(sentences.length, 1);

    if (avgSentenceLength <= 20 && avgWordLength <= 5.5) {
      details.readability = 5;
    } else if (avgSentenceLength <= 30) {
      details.readability = 3;
      recommendations.push('Use shorter sentences for better readability');
    } else {
      recommendations.push('Simplify writing: use shorter sentences and simpler words');
    }

    const total = Object.values(details).reduce((sum, v) => sum + v, 0);

    return { total, details, recommendations };
  }

  // ─── Sitemap Data Generation ────────────────────────────────────────────────

  // categoryId, when given, restricts this to one category's articles - the
  // per-hostname sitemap split (apex-only vs. this-category-only) needs
  // that, since a category's articles now belong to its own subdomain, not
  // the flat single-sitemap list this used to always return.
  async getSitemapEntries(organizationId: string, categoryId?: string): Promise<
    Array<{
      url: string;
      lastmod: string;
      changefreq: string;
      priority: number;
    }>
  > {
    const articles = await this.prisma.article.findMany({
      where: {
        organizationId,
        status: 'PUBLISHED',
        deletedAt: null,
        ...(categoryId && { primaryCategoryId: categoryId }),
      },
      select: {
        slug: true,
        updatedAt: true,
        primaryCategory: {
          select: { slug: true, subdomain: true, parent: { select: { subdomain: true } } },
        },
      },
      orderBy: { publishedAt: 'desc' },
    });

    const rootDomain = this.config ? getRootDomain(this.config) : 'rusdimedia.com';

    return articles.map((article) => ({
      url: getArticleUrl(article, rootDomain),
      lastmod: article.updatedAt.toISOString().split('T')[0],
      changefreq: 'weekly',
      priority: 0.8,
    }));
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  // Falls back to the org's freeform siteUrl setting unless both a category
  // with a subdomain assigned AND ConfigService (for ROOT_DOMAIN) are
  // available - this keeps every existing call site (the manual admin
  // schema/canonical endpoints, which don't have category data) working
  // exactly as before, while the auto-generation flow in
  // onArticlePublished below gets a real category-subdomain canonical URL.
  // Public (not just used internally by generateSeoData) so
  // scripts/backfill-article-schema.ts can reuse this exact logic instead
  // of a third divergent copy - see that script's own comment on the
  // siteUrl-duplication bug this avoided repeating.
  buildCanonicalUrl(
    siteUrl: string,
    slug: string,
    category?: { slug: string; subdomain?: string | null; parent?: { subdomain?: string | null } | null } | null,
  ): string {
    if (this.config && (category?.subdomain || category?.parent?.subdomain)) {
      return getArticleUrl({ slug, primaryCategory: category }, getRootDomain(this.config));
    }
    // Same as getArticleUrl's own path logic, just against the caller's
    // siteUrl instead of ROOT_DOMAIN - articles live at a bare `/{slug}`
    // (see common/url/site-url.util.ts).
    return `${siteUrl.replace(/\/$/, '')}/${slug}`;
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  // Also runs on 'article.geoReady' (emitted by GeoService once its
  // structuredSummary/entitiesCovered land, a beat after the first
  // publish) so the NewsArticle JSON-LD picks those up on a fresh article
  // without waiting for a manual re-save. Only articleId is guaranteed on
  // that payload, so organizationId is read off the article record.
  @OnEvent('article.published')
  @OnEvent('article.geoReady')
  async onArticlePublished(event: { articleId: string }) {
    try {
      const article = await this.prisma.article.findUnique({
        where: { id: event.articleId },
        include: {
          primaryAuthor: { select: { id: true, slug: true, displayName: true, metadata: true } },
          primaryCategory: {
            select: {
              name: true,
              slug: true,
              subdomain: true,
              parent: { select: { subdomain: true } },
            },
          },
          featuredImage: { select: { width: true, height: true } },
          articleTags: { include: { tag: { select: { name: true } } } },
          seoData: true,
          geoData: { select: { structuredSummary: true, entitiesCovered: true } },
        },
      });

      // Deliberately NOT skipped when seoData already exists - this handler
      // re-fires on every save that leaves an article PUBLISHED (not just
      // the first publish), so meta tags and the NewsArticle JSON-LD (in
      // particular dateModified) stay in sync with real edits instead of
      // being frozen at whatever they were the moment the article first
      // went live.
      if (!article) return;

      const org = await this.prisma.organization.findUnique({
        where: { id: article.organizationId },
        select: { name: true, logoUrl: true, settings: true },
      });

      // org.settings.siteUrl is an explicit admin override that's never
      // actually been set in practice - ROOT_DOMAIN (already the source of
      // truth for canonical/category-subdomain URLs elsewhere in this
      // file) is a far better fallback than the literal "https://
      // example.com" placeholder this used to drop straight to, which was
      // ending up in real, live author/publisher schema URLs.
      const siteUrl =
        (org?.settings as any)?.siteUrl ??
        (this.config ? `https://${getRootDomain(this.config)}` : 'https://example.com');

      // Values the editor set by hand in the article's SEO panel win over
      // anything this handler would generate, and survive every later
      // re-publish. Everything else (schema JSON-LD with a fresh
      // dateModified, canonical URL, OG image, scores) is still regenerated
      // each time so it tracks real edits.
      const manual = article.seoData ?? null;
      const keptMetaTitle = manual?.metaTitle?.trim() || undefined;
      const keptMetaDescription = manual?.metaDescription?.trim() || undefined;
      const keptFocusKeyword = manual?.focusKeyword?.trim() || undefined;
      const keptRobots =
        manual?.robots && manual.robots !== 'index,follow' ? manual.robots : undefined;

      // Per-author E-E-A-T signals live in user.metadata.authorProfile;
      // publisher-level ones in organization.settings.publisher. Both are
      // free-form JSON bags, so read defensively.
      const authorProfile =
        ((article.primaryAuthor?.metadata as any) ?? {}).authorProfile ?? {};
      const publisher = ((org?.settings as any) ?? {}).publisher ?? {};
      const strArray = (v: unknown): string[] | undefined =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : undefined;

      const seoData = await this.generateSeoData(
        event.articleId,
        {
          title: article.title,
          content: article.content,
          excerpt: article.excerpt ?? undefined,
          slug: article.slug,
          geoSummary: article.geoData?.structuredSummary ?? undefined,
          geoEntities: Array.isArray(article.geoData?.entitiesCovered)
            ? (article.geoData!.entitiesCovered as string[]).filter((e) => typeof e === 'string')
            : undefined,
          primaryCategory: article.primaryCategory,
          featuredImageUrl: article.featuredImageUrl ?? undefined,
          featuredImageWidth: article.featuredImage?.width ?? undefined,
          featuredImageHeight: article.featuredImage?.height ?? undefined,
          author: {
            id: article.primaryAuthor.id,
            slug: article.primaryAuthor.slug,
            displayName: article.primaryAuthor.displayName ?? 'Staff',
            jobTitle: typeof authorProfile.jobTitle === 'string' ? authorProfile.jobTitle : undefined,
            sameAs: strArray(authorProfile.sameAs),
          },
          publishedAt: article.publishedAt ?? undefined,
          updatedAt: article.updatedAt,
          tags: article.articleTags.map((at) => at.tag.name),
          wordCount: article.wordCount ?? undefined,
          language: article.language ?? undefined,
        },
        siteUrl,
        keptFocusKeyword,
        org
          ? {
              name: org.name,
              logoUrl: org.logoUrl,
              sameAs: strArray(publisher.sameAs),
              ethicsPolicyUrl:
                typeof publisher.ethicsPolicyUrl === 'string' ? publisher.ethicsPolicyUrl : undefined,
              correctionsPolicyUrl:
                typeof publisher.correctionsPolicyUrl === 'string'
                  ? publisher.correctionsPolicyUrl
                  : undefined,
              diversityPolicyUrl:
                typeof publisher.diversityPolicyUrl === 'string'
                  ? publisher.diversityPolicyUrl
                  : undefined,
              foundingDate:
                typeof publisher.foundingDate === 'string' ? publisher.foundingDate : undefined,
            }
          : undefined,
      );

      const merged = {
        ...seoData,
        ...(keptMetaTitle && { metaTitle: keptMetaTitle, ogTitle: keptMetaTitle }),
        ...(keptMetaDescription && {
          metaDescription: keptMetaDescription,
          ogDescription: keptMetaDescription,
        }),
        ...(keptFocusKeyword && { focusKeyword: keptFocusKeyword }),
        ...(keptRobots && { robots: keptRobots }),
      };

      await this.prisma.articleSeo.upsert({
        where: { articleId: event.articleId },
        create: {
          articleId: event.articleId,
          ...merged,
          schemaJsonld: merged.schemaJsonld as any,
        },
        update: {
          ...merged,
          schemaJsonld: merged.schemaJsonld as any,
        },
      });
    } catch (err) {
      console.error('[SEO] Failed to auto-generate SEO data:', err);
    }
  }
}
