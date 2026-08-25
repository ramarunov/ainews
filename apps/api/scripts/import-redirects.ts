import 'dotenv/config';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { createWithOrgTx } from './lib/org-tx';
import { parseCsv } from './lib/csv';

// Bulk-imports a redirects CSV (fromPath,toUrl,statusCode,note) into the
// Redirect table for one Organization - the dashboard's Redirects screen
// (apps/web/app/(dashboard)/(authenticated)/redirects/page.tsx) only
// creates one at a time, which doesn't scale for a site migration's worth
// of old URLs. Part of Fase 4 (redirects/QA) of the migration plan:
// C:\Users\Administrator\.claude\plans\elegant-launching-noodle.md
//
// Generic - the CSV can come from scripts/generate-redirect-suggestions.ts,
// a Google Search Console "Pages" export you've reshaped into this format,
// or anything else. `fromPath` is matched exactly against the request
// pathname by RedirectsService.resolve() (see apps/api/src/modules/seo/
// redirects.service.ts) - always a leading slash, no trailing slash, no
// query string.
//
// Usage:
//   INPUT_FILE=./redirects.csv ORG_SLUG=rusdimedia-local \
//     pnpm --filter api exec ts-node -r tsconfig-paths/register scripts/import-redirects.ts
//
// Env vars:
//   INPUT_FILE  required - path to the CSV file. Header row required,
//               must include at least fromPath,toUrl - statusCode
//               (default 301) and note are optional columns.
//   ORG_SLUG    required - the target Organization's slug
//   DRY_RUN     "true" to parse and report counts without writing anything
//               - default "true"
const prisma = new PrismaClient();
const withOrgTx = createWithOrgTx(prisma);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RedirectRow {
  fromPath: string;
  toUrl: string;
  statusCode: number;
  note?: string;
}

function parseRedirectCsv(text: string): RedirectRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const fromIdx = header.indexOf('fromPath');
  const toIdx = header.indexOf('toUrl');
  const statusIdx = header.indexOf('statusCode');
  const noteIdx = header.indexOf('note');
  if (fromIdx === -1 || toIdx === -1) {
    throw new Error(`CSV header must include fromPath,toUrl - got: ${header.join(',')}`);
  }

  return rows.slice(1).map((cols) => ({
    fromPath: cols[fromIdx]?.trim() ?? '',
    toUrl: cols[toIdx]?.trim() ?? '',
    statusCode: statusIdx !== -1 && cols[statusIdx] ? Number(cols[statusIdx]) : 301,
    note: noteIdx !== -1 ? cols[noteIdx]?.trim() : undefined,
  }));
}

async function main() {
  const inputFile = process.env.INPUT_FILE;
  const orgSlug = process.env.ORG_SLUG;
  if (!inputFile) throw new Error('INPUT_FILE is required (path to the redirects .csv file)');
  if (!orgSlug) throw new Error('ORG_SLUG is required (the target Organization already exists)');
  const dryRun = process.env.DRY_RUN !== 'false';

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  if (!UUID_RE.test(org.id)) throw new Error(`Unexpected organization id shape: ${org.id}`);

  const rows = parseRedirectCsv(readFileSync(inputFile, 'utf-8'));
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Importing ${rows.length} redirect(s) from ${inputFile} into org "${orgSlug}"...`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.fromPath.startsWith('/')) {
      console.warn(`  [skip] "${row.fromPath}" doesn't start with / - not a valid path`);
      skipped++;
      continue;
    }
    if (![301, 302, 410].includes(row.statusCode)) {
      console.warn(`  [skip] "${row.fromPath}": statusCode ${row.statusCode} must be 301, 302, or 410`);
      skipped++;
      continue;
    }

    try {
      const existing: any = await withOrgTx(org.id, (tx: any) =>
        tx.redirect.findUnique({
          where: { organizationId_fromPath: { organizationId: org.id, fromPath: row.fromPath } },
        }),
      );

      if (existing) {
        if (existing.toUrl === row.toUrl && existing.statusCode === row.statusCode) {
          skipped++;
          continue;
        }
        if (!dryRun) {
          await withOrgTx(org.id, (tx: any) =>
            tx.redirect.update({
              where: { id: existing.id },
              data: { toUrl: row.toUrl, statusCode: row.statusCode, note: row.note },
            }),
          );
        }
        updated++;
        continue;
      }

      if (!dryRun) {
        await withOrgTx(org.id, (tx: any) =>
          tx.redirect.create({
            data: {
              organizationId: org.id,
              fromPath: row.fromPath,
              toUrl: row.toUrl,
              statusCode: row.statusCode,
              note: row.note,
            },
          }),
        );
      }
      created++;
    } catch (err: any) {
      console.error(`  [failed] "${row.fromPath}": ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + (dryRun ? 'Dry run complete (nothing was written).' : 'Import complete.'));
  console.table({ created, updated, skipped, failed });
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
