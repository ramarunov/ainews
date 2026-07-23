import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { SeoService } from '../src/modules/seo/seo.service';
import { runWithOrgContext } from '../src/infrastructure/prisma/org-context';
import { getRootDomain } from '../src/common/url/site-url.util';

// One-time backfill for the NewsArticle/Person schema enrichment
// (articleSection, keywords, wordCount, inLanguage, isAccessibleForFree,
// author.url, image dimensions, NewsMediaOrganization) plus canonicalUrl
// (which turned out to have its own pre-existing bug - see the siteUrl
// comment below) - SeoService only regenerates these on the
// article.published EVENT, so every already-published article keeps its
// old values until it's next saved. This recomputes and updates ONLY the
// schemaJsonld/canonicalUrl columns via generateArticleSchema()/
// buildCanonicalUrl() directly - deliberately not the full
// generateSeoData()/onArticlePublished() pipeline, which also calls the AI
// gateway for meta title/description on every article. Safe to re-run.
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const prisma = app.get(PrismaService);
  const seoService = app.get(SeoService);
  const config = app.get(ConfigService);

  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, logoUrl: true, settings: true },
  });
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const org of organizations) {
    await runWithOrgContext(org.id, async () => {
      const articles = await prisma.article.findMany({
        where: { organizationId: org.id, status: 'PUBLISHED', deletedAt: null },
        include: {
          primaryAuthor: { select: { id: true, displayName: true } },
          primaryCategory: {
            select: { name: true, slug: true, subdomain: true, parent: { select: { subdomain: true } } },
          },
          featuredImage: { select: { width: true, height: true } },
          articleTags: { include: { tag: { select: { name: true } } } },
          seoData: true,
        },
      });

      if (articles.length === 0) return;
      console.log(`${org.name}: ${articles.length} published article(s)`);

      // Mirrors SeoService.onArticlePublished's own fallback (see its
      // comment - org.settings.siteUrl has never actually been configured
      // in practice).
      const siteUrl = (org.settings as any)?.siteUrl ?? `https://${getRootDomain(config)}`;

      for (const article of articles) {
        if (!article.seoData) {
          skipped++;
          continue;
        }
        try {
          const schemaJsonld = await seoService.generateArticleSchema(
            {
              title: article.title,
              excerpt: article.excerpt ?? undefined,
              slug: article.slug,
              primaryCategory: article.primaryCategory,
              featuredImageUrl: article.featuredImageUrl ?? undefined,
              featuredImageWidth: article.featuredImage?.width ?? undefined,
              featuredImageHeight: article.featuredImage?.height ?? undefined,
              author: {
                id: article.primaryAuthor.id,
                displayName: article.primaryAuthor.displayName ?? 'Staff',
              },
              publishedAt: article.publishedAt ?? undefined,
              updatedAt: article.updatedAt,
              tags: article.articleTags.map((at) => at.tag.name),
              wordCount: article.wordCount ?? undefined,
              language: article.language ?? undefined,
            },
            siteUrl,
            { name: org.name, logoUrl: org.logoUrl },
          );

          const canonicalUrl = seoService.buildCanonicalUrl(siteUrl, article.slug, article.primaryCategory);

          await prisma.articleSeo.update({
            where: { articleId: article.id },
            data: { schemaJsonld: schemaJsonld as any, canonicalUrl },
          });
          updated++;
        } catch (err) {
          failed++;
          console.error(`  [failed] ${article.slug}`, err);
        }
      }
    });
  }

  console.log(`Done. updated=${updated} skipped=${skipped} (no seoData row) failed=${failed}`);
  await app.close();
  // Nest's application context doesn't tear down every lingering handle on
  // its own (BullMQ/Redis connections, the cron-based scheduler services -
  // ScheduledPublishScheduler etc. - all module-scoped, not specific to
  // this script) - without this the process hangs indefinitely after
  // printing "Done." instead of actually exiting. Same pattern as
  // backfill-embeddings.ts.
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
