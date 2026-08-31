import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { TranslationService } from '../src/modules/translation/translation.service';
import { runWithOrgContext } from '../src/infrastructure/prisma/org-context';

// One-off backfill: create the English translation (/en/{slug}, IN_REVIEW)
// for already-published Indonesian articles. The auto-translation event
// handler only fires on an article's FIRST publish, so anything published
// before Phase 2 shipped - or while news.autonomous_translation.enabled was
// off - needs this.
//
// Each translated article costs one AIWriterService.translateArticle() call
// (two model requests). DEFAULT SCOPE IS DELIBERATELY NARROW: only
// AI-assisted articles (the autonomous-pipeline output), NOT the ~2400
// migrated WordPress archive articles. Pass --all to include those too, and
// read the printed count/cost note before doing so.
//
// Runs a DRY RUN by default (lists what it would translate). Pass --execute
// to actually create translations. Safe to re-run: an article that already
// has an English translation is skipped.
//
//   npx ts-node -r tsconfig-paths/register scripts/backfill-translations.ts [flags]
//
// Flags:
//   --execute            actually create translations (default: dry run)
//   --all                include non-AI-assisted articles (the WP archive)
//   --limit=N            translate at most N articles (newest first)
//   --since=YYYY-MM-DD    only articles published on/after this date
//   --delay=MS           pause between articles (default 1500)

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const EXECUTE = process.argv.includes('--execute');
const ALL = process.argv.includes('--all');
const LIMIT = argValue('limit') ? Math.max(1, parseInt(argValue('limit')!, 10)) : undefined;
const SINCE = argValue('since');
const DELAY_MS = argValue('delay') ? Math.max(0, parseInt(argValue('delay')!, 10)) : 1500;

const SKIP_PATTERN = /already exists|itself a translation|Only id articles/i;

(async () => {
  if (SINCE && Number.isNaN(Date.parse(SINCE))) {
    console.error(`--since must be an ISO date (YYYY-MM-DD), got "${SINCE}"`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const prisma = app.get(PrismaService);
  const translation = app.get(TranslationService);

  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });

  let planned = 0;
  let translated = 0;
  let skipped = 0;
  let failed = 0;

  for (const org of organizations) {
    await runWithOrgContext(org.id, async () => {
      const articles = await prisma.article.findMany({
        where: {
          organizationId: org.id,
          status: 'PUBLISHED',
          deletedAt: null,
          language: 'id',
          translationOf: null,
          // Skip anything that already has an English counterpart.
          translations: { none: { language: 'en' } },
          ...(ALL ? {} : { isAiAssisted: true }),
          ...(SINCE ? { publishedAt: { gte: new Date(SINCE) } } : {}),
        },
        select: { id: true, slug: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
        ...(LIMIT ? { take: LIMIT } : {}),
      });

      planned += articles.length;
      const scope = [
        ALL ? 'ALL published' : 'AI-assisted only',
        SINCE ? `since ${SINCE}` : null,
        LIMIT ? `limit ${LIMIT}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      console.log(`\n[${org.name}] ${articles.length} article(s) need an English translation (${scope})`);

      for (const article of articles) {
        const label = `${article.slug} (${article.publishedAt?.toISOString().slice(0, 10) ?? 'no date'})`;

        if (!EXECUTE) {
          console.log(`  [dry-run] ${label}`);
          continue;
        }

        try {
          const result = await translation.translateNow(article.id, org.id);
          console.log(`  [ok]   ${label}  ->  /en/${result.slug}`);
          translated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (SKIP_PATTERN.test(message)) {
            console.log(`  [skip] ${label}: ${message}`);
            skipped++;
          } else {
            console.error(`  [fail] ${label}: ${message}`);
            failed++;
          }
        }

        if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    });
  }

  console.log(
    `\n${EXECUTE ? 'Done' : 'Dry run complete'}. planned=${planned} translated=${translated} skipped=${skipped} failed=${failed}`,
  );
  if (!EXECUTE) {
    console.log(
      `\nNothing was created. Re-run with --execute to translate these ${planned} article(s).` +
        `\nEach one is a single translate call (~2 model requests). Translations land IN_REVIEW;` +
        `\napprove them from the review queue or the "Publish all pending English translations" button.`,
    );
  }

  await app.close();
  // Nest's application context leaves Redis/BullMQ/scheduler handles open;
  // without this the process hangs after printing the summary. Same pattern
  // as backfill-article-schema.ts / backfill-embeddings.ts.
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
