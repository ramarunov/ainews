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
    article: {
      title: string;
      content: string;
      excerpt?: string;
      slug: string;
      primaryCategory?: { slug: string; subdomain?: string | null } | null;
      featuredImageUrl?: string;
      author?: { displayName: string };
      publishedAt?: Date;
      updatedAt?: Date;
    },
    siteUrl: string,
    focusKeyword?: string,
    organization?: { name: string; logoUrl?: string | null },
  ): Promise<SeoData> {
    // Each piece degrades independently rather than via a single Promise.all
    // - the AI-backed meta title/description calls can fail on their own
    // (AI services disabled, provider outage) without also losing the
    // schema.org JSON-LD below, which needs no AI at all. Before this fix,
    // one AI failure silently aborted the entire SEO package, meaning a
    // fresh install with AI services off would never get structured data
    // on any article, ever - not just a degraded meta title.
    const [metaTitle, metaDescription, schema] = await Promise.all([
      this.generateMetaTitle(article.title, focusKeyword).catch(() => article.title.substring(0, 60)),
      this.aiWriter
        .generateMetaDescription(article.content, focusKeyword)
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

  async generateMetaTitle(title: string, focusKeyword?: string): Promise<string> {
    // Try to fit within 60 chars with keyword
    if (title.length <= 60) {
      return title;
    }

    const result = await this.aiGateway.prompt(
      `You are an SEO specialist. Create an SEO-optimized meta title.
Rules: 50-60 characters max. Include focus keyword if provided.
Return ONLY the title text, no quotes or explanation.`,
      `Original title: ${title}${focusKeyword ? `\nFocus keyword: ${focusKeyword}` : ''}`,
      { temperature: 0.3, maxTokens: 100 },
    );

    return result.trim().replace(/^["']|["']$/g, '').substring(0, 60);
  }

  // ─── Schema.org JSON-LD Generation ─────────────────────────────────────────

  async generateArticleSchema(
    article: {
      title: string;
      content?: string;
      excerpt?: string;
      slug: string;
      primaryCategory?: { slug: string; subdomain?: string | null } | null;
      featuredImageUrl?: string;
      author?: { displayName: string };
      publishedAt?: Date;
      updatedAt?: Date;
    },
    siteUrl: string,
    organization?: { name: string; logoUrl?: string | null },
  ): Promise<object> {
    const url = this.buildCanonicalUrl(siteUrl, article.slug, article.primaryCategory);

    const schema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: article.title,
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      description: article.excerpt ?? '',
      datePublished: article.publishedAt?.toISOString(),
      // Falls back to publishedAt when updatedAt isn't available (e.g. the
      // manual schema/article endpoint, which has no article record) -
      // never the moment this function happens to run, which would silently
      // drift from the article's real edit history.
      dateModified: (article.updatedAt ?? article.publishedAt)?.toISOString(),
      author: article.author
        ? {
            '@type': 'Person',
            name: article.author.displayName,
          }
        : undefined,
      image: article.featuredImageUrl
        ? {
            '@type': 'ImageObject',
            url: article.featuredImageUrl,
          }
        : undefined,
      publisher: organization
        ? {
            '@type': 'Organization',
            name: organization.name,
            // Points at the About/Editorial-Policy/Corrections page - the
            // closest this codebase has to real NewsMediaOrganization-style
            // ownership/editorial transparency without a dedicated schema.
            url: `${siteUrl.replace(/\/$/, '')}/about`,
            logo: organization.logoUrl
              ? { '@type': 'ImageObject', url: organization.logoUrl }
              : undefined,
          }
        : undefined,
    };

    // Remove undefined values
    Object.keys(schema).forEach(
      (k) => schema[k] === undefined && delete schema[k],
    );
    if (schema.publisher) {
      Object.keys(schema.publisher).forEach(
        (k) => schema.publisher[k] === undefined && delete schema.publisher[k],
      );
    }

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
    const internalLinks = (content.match(/<a\s[^>]*href=["']\/news\//gi) ?? []).length;
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
        primaryCategory: { select: { slug: true, subdomain: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    const rootDomain = this.config ? getRootDomain(this.config) : 'beritabot.com';

    return articles.map((article) => ({
      url: getArticleUrl(article, rootDomain),
      lastmod: article.updatedAt.toISOString().split('T')[0],
      changefreq: 'weekly',
      priority: 0.8,
    }));
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  // Falls back to the org's freeform siteUrl setting (`/news/:slug`) unless
  // both a category with a subdomain assigned AND ConfigService (for
  // ROOT_DOMAIN) are available - this keeps every existing call site (the
  // manual admin schema/canonical endpoints, which don't have category data)
  // working exactly as before, while the auto-generation flow in
  // onArticlePublished below gets a real category-subdomain canonical URL.
  private buildCanonicalUrl(
    siteUrl: string,
    slug: string,
    category?: { slug: string; subdomain?: string | null } | null,
  ): string {
    if (category?.subdomain && this.config) {
      return getArticleUrl({ slug, primaryCategory: category }, getRootDomain(this.config));
    }
    return `${siteUrl.replace(/\/$/, '')}/news/${slug}`;
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  @OnEvent('article.published')
  async onArticlePublished(event: { articleId: string; organizationId: string; slug: string }) {
    try {
      const article = await this.prisma.article.findUnique({
        where: { id: event.articleId },
        include: {
          primaryAuthor: { select: { displayName: true } },
          primaryCategory: { select: { slug: true, subdomain: true } },
          seoData: true,
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
        where: { id: event.organizationId },
        select: { name: true, logoUrl: true, settings: true },
      });

      const siteUrl = (org?.settings as any)?.siteUrl ?? 'https://example.com';

      const seoData = await this.generateSeoData(
        event.articleId,
        {
          title: article.title,
          content: article.content,
          excerpt: article.excerpt ?? undefined,
          slug: article.slug,
          primaryCategory: article.primaryCategory,
          featuredImageUrl: article.featuredImageUrl ?? undefined,
          author: { displayName: article.primaryAuthor.displayName ?? 'Staff' },
          publishedAt: article.publishedAt ?? undefined,
          updatedAt: article.updatedAt,
        },
        siteUrl,
        undefined,
        org ? { name: org.name, logoUrl: org.logoUrl } : undefined,
      );

      await this.prisma.articleSeo.upsert({
        where: { articleId: event.articleId },
        create: {
          articleId: event.articleId,
          ...seoData,
          schemaJsonld: seoData.schemaJsonld as any,
        },
        update: {
          ...seoData,
          schemaJsonld: seoData.schemaJsonld as any,
        },
      });
    } catch (err) {
      console.error('[SEO] Failed to auto-generate SEO data:', err);
    }
  }
}
