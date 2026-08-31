import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ArticleStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AIWriterService } from '../ai/ai-writer.service';
import { ArticlesService } from '../articles/articles.service';
import { UpdateArticleDto } from '../articles/dto/article.dto';
import { SettingsService } from '../settings/settings.service';

// Parallel-edition feature: the site is Indonesian at /{slug}; this service
// produces the English translation edition at /en/{slug}. Source is always
// 'id', target always 'en' for now - if a third language is ever added this
// becomes a matrix, but a fixed pair keeps the guards trivial today.
const SOURCE_LANGUAGE = 'id';
const TARGET_LANGUAGE = 'en';

export const TRANSLATION_SETTINGS = {
  // Org setting (settings table). Default OFF - each published Indonesian
  // article otherwise costs one large translation call, so an admin opts
  // in explicitly (AI Settings page) the same way they do for the
  // autonomous publishing pipeline.
  enabled: 'news.autonomous_translation.enabled',
} as const;

interface ArticlePublishedEvent {
  articleId: string;
  organizationId?: string;
  isFirstPublish?: boolean;
}

// Everything createTranslation() needs off the source article, in one place
// so the event handler and the manual endpoint select exactly the same shape.
const SOURCE_SELECT = {
  id: true,
  organizationId: true,
  primaryAuthorId: true,
  primaryCategoryId: true,
  title: true,
  subtitle: true,
  excerpt: true,
  content: true,
  slug: true,
  featuredImageId: true,
  featuredImageAlt: true,
  sourceUrl: true,
  sourceName: true,
  commentsEnabled: true,
  language: true,
  translationOf: true,
  articleCategories: { select: { categoryId: true } },
  articleTags: { select: { tagId: true } },
  translations: { select: { language: true, slug: true, status: true } },
} satisfies Prisma.ArticleSelect;

type SourceArticle = Prisma.ArticleGetPayload<{ select: typeof SOURCE_SELECT }>;

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiWriter: AIWriterService,
    private readonly articlesService: ArticlesService,
    private readonly settings: SettingsService,
  ) {}

  // Fire-and-forget, like every other article.published listener - a
  // translation failure must never break the Indonesian publish that
  // triggered it.
  @OnEvent('article.published')
  async onArticlePublished(event: ArticlePublishedEvent): Promise<void> {
    try {
      // Only on the very first publish. A re-publish of an existing article
      // must not spawn a second translation, and the ~2500 pre-existing
      // articles are backfilled explicitly via translateNow(), not by
      // re-saving them.
      if (!event.isFirstPublish) return;

      const article = await this.prisma.article.findUnique({
        where: { id: event.articleId },
        select: SOURCE_SELECT,
      });
      if (!this.isTranslatable(article)) return;

      const enabled = await this.settings.get(article.organizationId, TRANSLATION_SETTINGS.enabled);
      if (enabled !== true) return;

      await this.createTranslation(article);
    } catch (err) {
      this.logger.error(
        `Auto-translation failed for article ${event.articleId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Manual / backfill trigger (POST /translation/articles/:id). Unlike the
   * event handler this ignores the org enabled-flag (an explicit request is
   * its own opt-in) and throws instead of silently returning, so the caller
   * sees why nothing happened.
   */
  async translateNow(articleId: string, organizationId: string): Promise<{ id: string; slug: string }> {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId, deletedAt: null },
      select: SOURCE_SELECT,
    });
    if (!article) throw new NotFoundException('Article not found');
    if (article.language !== SOURCE_LANGUAGE) {
      throw new BadRequestException(`Only ${SOURCE_LANGUAGE} articles can be translated`);
    }
    if (article.translationOf) {
      throw new BadRequestException('This article is itself a translation');
    }
    const existing = article.translations.find((t) => t.language === TARGET_LANGUAGE);
    if (existing) {
      throw new BadRequestException(
        `An ${TARGET_LANGUAGE} translation already exists (${existing.slug})`,
      );
    }
    const created = await this.createTranslation(article);
    return { id: created.id, slug: created.slug };
  }

  /**
   * Publish every pending (IN_REVIEW) English translation in one action -
   * the "approve all" button for the review queue. Each goes through
   * ArticlesService.update() so it gets the full first-publish treatment
   * (publishedAt, article.published event -> GEO/SEO/WebSub for the English
   * edition).
   */
  async approvePending(
    organizationId: string,
    userId: string,
  ): Promise<{ pending: number; published: number }> {
    const pending = await this.prisma.article.findMany({
      where: {
        organizationId,
        deletedAt: null,
        language: TARGET_LANGUAGE,
        status: ArticleStatus.IN_REVIEW,
        translationOf: { not: null },
      },
      select: { id: true },
    });

    let published = 0;
    for (const { id } of pending) {
      try {
        await this.articlesService.update(
          id,
          { status: ArticleStatus.PUBLISHED } as UpdateArticleDto,
          userId,
          organizationId,
        );
        published++;
      } catch (err) {
        this.logger.error(
          `Failed to publish pending translation ${id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    return { pending: pending.length, published };
  }

  private isTranslatable(article: SourceArticle | null): article is SourceArticle {
    if (!article) return false;
    if (article.language !== SOURCE_LANGUAGE) return false;
    if (article.translationOf) return false;
    if (article.translations.some((t) => t.language === TARGET_LANGUAGE)) return false;
    return true;
  }

  private async createTranslation(article: SourceArticle): Promise<{ id: string; slug: string }> {
    const translated = await this.aiWriter.translateArticle({
      title: article.title,
      content: article.content,
      subtitle: article.subtitle,
      excerpt: article.excerpt,
      sourceLanguage: SOURCE_LANGUAGE,
      targetLanguage: TARGET_LANGUAGE,
      organizationId: article.organizationId,
      articleId: article.id,
    });

    // Reuse the source article's category, tags, featured image and byline -
    // only the human-readable text is translated. create() re-slugs from the
    // English title (collision-safe) and resolves featuredImageUrl from the
    // shared image id.
    const created = await this.articlesService.create(
      {
        title: translated.title,
        subtitle: translated.subtitle ?? undefined,
        excerpt: translated.excerpt ?? undefined,
        content: translated.content,
        primaryCategoryId: article.primaryCategoryId ?? undefined,
        categoryIds: article.articleCategories.map((c) => c.categoryId),
        tagIds: article.articleTags.map((t) => t.tagId),
        featuredImageId: article.featuredImageId ?? undefined,
        featuredImageAlt: article.featuredImageAlt ?? undefined,
        sourceUrl: article.sourceUrl ?? undefined,
        sourceName: article.sourceName ?? undefined,
        commentsEnabled: article.commentsEnabled,
        language: TARGET_LANGUAGE,
        translationOf: article.id,
        isAiAssisted: true,
      },
      article.primaryAuthorId,
      article.organizationId,
    );

    // Lands in the review queue, not live - a human approves it (or the
    // bulk approvePending() action does).
    await this.articlesService.update(
      created.id,
      {
        status: ArticleStatus.IN_REVIEW,
        changeSummary: 'AI translation, pending review',
      } as UpdateArticleDto,
      article.primaryAuthorId,
      article.organizationId,
    );

    this.logger.log(
      `Created ${TARGET_LANGUAGE} translation "${created.slug}" for ${article.language} article "${article.slug}" (${article.id})`,
    );
    return { id: created.id, slug: created.slug };
  }
}
