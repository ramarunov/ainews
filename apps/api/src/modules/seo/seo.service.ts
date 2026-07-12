import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AIGatewayService } from '../ai/ai-gateway.service';
import { AIWriterService } from '../ai/ai-writer.service';

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
  ) {}

  // ─── Generate Full SEO Package ─────────────────────────────────────────────

  async generateSeoData(
    articleId: string,
    article: {
      title: string;
      content: string;
      excerpt?: string;
      slug: string;
      primaryCategorySlug?: string;
      featuredImageUrl?: string;
      author?: { displayName: string };
      publishedAt?: Date;
    },
    siteUrl: string,
    focusKeyword?: string,
  ): Promise<SeoData> {
    const [metaTitle, metaDescription, schema] = await Promise.all([
      this.generateMetaTitle(article.title, focusKeyword),
      this.aiWriter.generateMetaDescription(article.content, focusKeyword),
      this.generateArticleSchema(article, siteUrl),
    ]);

    const canonicalUrl = this.buildCanonicalUrl(siteUrl, article.slug);
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
      featuredImageUrl?: string;
      author?: { displayName: string };
      publishedAt?: Date;
    },
    siteUrl: string,
  ): Promise<object> {
    const url = this.buildCanonicalUrl(siteUrl, article.slug);

    const schema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: article.title,
      url,
      description: article.excerpt ?? '',
      datePublished: article.publishedAt?.toISOString(),
      dateModified: new Date().toISOString(),
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
    };

    // Remove undefined values
    Object.keys(schema).forEach(
      (k) => schema[k] === undefined && delete schema[k],
    );

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
      internalLinkCount?: number;
      imageCount?: number;
      imagesWithAlt?: number;
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

    // Internal links (10 points)
    const internalLinks = options.internalLinkCount ?? 0;
    if (internalLinks >= 3) {
      details.internalLinks = 10;
    } else if (internalLinks >= 1) {
      details.internalLinks = 5;
      recommendations.push('Add more internal links (aim for 3+)');
    } else {
      recommendations.push('Add internal links to related content');
    }

    // Image alt text (5 points)
    const totalImages = options.imageCount ?? 0;
    const altImages = options.imagesWithAlt ?? 0;
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

  async getSitemapEntries(organizationId: string): Promise<
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
      },
      select: {
        slug: true,
        updatedAt: true,
        primaryCategory: { select: { slug: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    return articles.map((article) => ({
      url: `/${article.primaryCategory?.slug ?? 'news'}/${article.slug}`,
      lastmod: article.updatedAt.toISOString().split('T')[0],
      changefreq: 'weekly',
      priority: 0.8,
    }));
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private buildCanonicalUrl(siteUrl: string, slug: string): string {
    return `${siteUrl.replace(/\/$/, '')}/${slug}`;
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  @OnEvent('article.published')
  async onArticlePublished(event: { articleId: string; organizationId: string; slug: string }) {
    try {
      const article = await this.prisma.article.findUnique({
        where: { id: event.articleId },
        include: {
          primaryAuthor: { select: { displayName: true } },
          primaryCategory: { select: { slug: true } },
          seoData: true,
        },
      });

      if (!article || article.seoData) return; // Skip if SEO data already exists

      const org = await this.prisma.organization.findUnique({
        where: { id: event.organizationId },
        select: { settings: true },
      });

      const siteUrl = (org?.settings as any)?.siteUrl ?? 'https://example.com';

      const seoData = await this.generateSeoData(
        event.articleId,
        {
          title: article.title,
          content: article.content,
          excerpt: article.excerpt ?? undefined,
          slug: article.slug,
          featuredImageUrl: article.featuredImageUrl ?? undefined,
          author: { displayName: article.primaryAuthor.displayName ?? 'Staff' },
          publishedAt: article.publishedAt ?? undefined,
        },
        siteUrl,
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
