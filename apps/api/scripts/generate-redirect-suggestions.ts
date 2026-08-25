import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { parseWxr, looksLikeUnrenderedContent } from './lib/wxr-parser';

// Scans a WordPress WXR export for old URLs that scripts/import-wordpress.ts
// could NOT preserve 1:1 as a new flat `/{slug}` URL, and writes a redirect
// CSV (fromPath,toUrl,statusCode,note) ready for
// scripts/import-redirects.ts. Part of Fase 4 (redirects/QA) of the
// migration plan: C:\Users\Administrator\.claude\plans\elegant-launching-noodle.md
//
// This can only suggest redirects for gaps visible in the export itself
// (theme/plugin utility pages that got skipped, common WP/SEO-plugin
// system URLs). It has no way to know which OTHER old URLs still get real
// search traffic (renamed/deleted posts, category slugs that changed over
// the site's history, ...) - once real hosting exists, cross-reference
// Google Search Console's "Pages" report (or server access logs) against
// this site and add those manually via the same CSV format.
//
// Usage:
//   WXR_FILE=./export.xml OUTPUT_FILE=./redirects.csv \
//     pnpm --filter api exec ts-node -r tsconfig-paths/register scripts/generate-redirect-suggestions.ts
//
// Env vars:
//   WXR_FILE     required - path to the exported .xml file
//   OUTPUT_FILE  where to write the CSV - default "./redirect-suggestions.csv"

// Mirrors apps/web/lib/dashboard-routes.ts's DASHBOARD_PATHS (kept in sync
// manually - see apps/web/lib/site-url.ts's header comment on why there's
// no shared package between apps/web and apps/api). A Redirect row for one
// of these can never fire: proxy.ts's isPublicPath() bounces the exact
// path to the dashboard host before the request ever reaches
// [slug]/page.tsx's redirect-resolution logic, regardless of what's in the
// Redirect table - confirmed live when rusdimedia.com's real export
// suggested redirecting "/login" and "/register" (both real dashboard
// routes) to the homepage, which silently never took effect. Skipping
// these here avoids suggesting a redirect that would just sit inert.
const DASHBOARD_PATHS = new Set([
  'login', 'register', 'forgot-password', 'reset-password', 'oauth-callback',
  'articles', 'categories', 'pages', 'tags', 'series', 'media', 'article-search',
  'workflow', 'calendar', 'news-intelligence', 'analytics', 'redirects',
  'users', 'api-keys', 'activity', 'system-settings', 'account',
]);

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function main() {
  const wxrFile = process.env.WXR_FILE;
  if (!wxrFile) throw new Error('WXR_FILE is required (path to the exported .xml file)');
  const outputFile = process.env.OUTPUT_FILE ?? './redirect-suggestions.csv';

  const xml = readFileSync(wxrFile, 'utf-8');
  const { posts } = parseWxr(xml);

  const rows: { fromPath: string; toUrl: string; statusCode: number; note: string }[] = [];

  // Every skipped theme/plugin utility page (see import-wordpress.ts's
  // looksLikeUnrenderedContent) still had a real, possibly-indexed old URL
  // - redirect it to the homepage rather than leaving it a hard 404.
  let skippedDashboardCollisions = 0;
  for (const post of posts) {
    if (post.postType !== 'page') continue;
    if (post.status !== 'publish') continue;
    if (!looksLikeUnrenderedContent(post.content)) continue;
    if (!post.slug) continue;
    if (DASHBOARD_PATHS.has(post.slug)) {
      skippedDashboardCollisions++;
      continue;
    }
    rows.push({
      fromPath: `/${post.slug}`,
      toUrl: '/',
      statusCode: 301,
      note: `WordPress theme/plugin utility page ("${post.title}"), not real content - see import-wordpress.ts's skippedUnrenderedContent`,
    });
  }

  // Common WordPress/Yoast/RankMath system sitemap paths, redirected to
  // this app's own /sitemap.xml (see apps/web/app/sitemap.ts) - cheap
  // insurance for search-engine continuity if either was ever submitted to
  // Search Console. Remove the ones that don't apply to this site's actual
  // SEO plugin.
  rows.push(
    { fromPath: '/sitemap_index.xml', toUrl: '/sitemap.xml', statusCode: 301, note: 'Yoast SEO sitemap index' },
    { fromPath: '/wp-sitemap.xml', toUrl: '/sitemap.xml', statusCode: 301, note: 'WordPress core sitemap' },
  );

  const header = 'fromPath,toUrl,statusCode,note';
  const csv = [header, ...rows.map((r) => [r.fromPath, r.toUrl, r.statusCode, r.note].map((v) => csvEscape(String(v))).join(','))].join('\n');
  writeFileSync(outputFile, csv, 'utf-8');

  console.log(`Wrote ${rows.length} redirect suggestion(s) to ${outputFile}`);
  if (skippedDashboardCollisions > 0) {
    console.log(
      `Skipped ${skippedDashboardCollisions} slug(s) matching a real dashboard route (login, register, ...) - ` +
        `a redirect for those can never fire; see this file's DASHBOARD_PATHS comment.`,
    );
  }
  console.log('Review before importing - especially the sitemap paths, which are guesses about this site\'s SEO plugin.');
  console.log(`Then: INPUT_FILE=${outputFile} ORG_SLUG=... pnpm --filter api exec ts-node -r tsconfig-paths/register scripts/import-redirects.ts`);
}

main();
