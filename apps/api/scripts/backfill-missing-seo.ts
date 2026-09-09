import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { SeoService } from '../src/modules/seo/seo.service';
import { runWithOrgContext } from '../src/infrastructure/prisma/org-context';

// One-time backfill: creates the missing ArticleSeo row (metaTitle,
// metaDescription, canonicalUrl, NewsArticle schema.org JSON-LD) for
// published articles that never got one - almost entirely the ~2,400
// WordPress-import articles, which were inserted directly by
// import-wordpress.ts and never emitted `article.published`, so
// SeoService.onArticlePublished() never ran for them. Confirmed via a prod
// DB audit (2026-09-09): 2,364 of 2,617 published articles had zero
// article_seo row, meaning their public page renders with NO NewsArticle
// JSON-LD at all (article-content.tsx only renders the schema <script>
// when article.seoData?.schemaJsonld is present) - a major, concrete
// contributor to Search Console's "Crawled/Discovered - currently not
// indexed" counts, on top of the same articles' excerpt column also being
// universally empty (so even the metaDescription fallback had nothing).
//
// Calls SeoService.onArticlePublished({ articleId }) directly (not via the
// EventEmitter) - the exact same function the normal publish flow uses, so
// it's already resilient to an AI outage: generateSeoData() runs metaTitle/
// metaDescription/schema as three independently-degrading calls (see its
// own comment) - metaTitle falls back to a plain substring, metaDescription
// falls back to a stripped-content excerpt, and generateArticleSchema()
// never calls AI at all. Calling it directly - not through
// articlesService.update() - deliberately does NOT also trigger
// GeoService/WebSubService/GoogleIndexingService/internal-linking, which DO
// depend on AI or external quotas (Google's Indexing API is capped at
// ~200 URL notifications/day); this backfill is scoped to the SEO gap only.
//
// Dry run by default. Safe to re-run - the WHERE clause only selects
// articles still missing seoData, so already-backfilled ones are skipped,
// not reprocessed.
//
//   npx ts-node -r tsconfig-paths/register scripts/backfill-missing-seo.ts [flags]
//
// Flags:
//   --execute      actually write (default: dry run)
//   --limit=N      process at most N articles (per organization)
//   --delay=MS     pause between articles (default 50 - no external API
//                  quota to respect here, just gentle DB/AI-gateway pacing)

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const EXECUTE = process.argv.includes('--execute');
const LIMIT = argValue('limit') ? Math.max(1, parseInt(argValue('limit')!, 10)) : undefined;
const DELAY_MS = argValue('delay') ? Math.max(0, parseInt(argValue('delay')!, 10)) : 50;

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const prisma = app.get(PrismaService);
  const seoService = app.get(SeoService);

  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });

  let planned = 0;
  let done = 0;

  for (const org of organizations) {
    await runWithOrgContext(org.id, async () => {
      const articles = await prisma.article.findMany({
        where: {
          organizationId: org.id,
          status: 'PUBLISHED',
          deletedAt: null,
          seoData: null,
        },
        select: { id: true, slug: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
        ...(LIMIT ? { take: LIMIT } : {}),
      });

      planned += articles.length;
      if (articles.length === 0) return;
      console.log(`\n[${org.name}] ${articles.length} published article(s) missing SEO data`);

      for (const article of articles) {
        const label = `${article.slug} (${article.publishedAt?.toISOString().slice(0, 10) ?? 'no date'})`;

        if (!EXECUTE) {
          console.log(`  [dry-run] ${label}`);
          continue;
        }

        // onArticlePublished catches and logs its own errors internally
        // (never throws) - a "[SEO] Failed to auto-generate..." line from
        // the service itself, if any, is the real per-article failure
        // signal, not an exception here.
        await seoService.onArticlePublished({ articleId: article.id });
        console.log(`  [ok]   ${label}`);
        done++;

        if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    });
  }

  console.log(`\n${EXECUTE ? 'Done' : 'Dry run complete'}. planned=${planned} done=${done}`);
  if (!EXECUTE) {
    console.log(`\nNothing was written. Re-run with --execute to backfill these ${planned} article(s).`);
  }

  await app.close();
  // Nest's application context leaves Redis/BullMQ/scheduler handles open;
  // without this the process hangs after printing the summary. Same pattern
  // as backfill-translations.ts / backfill-article-schema.ts.
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
