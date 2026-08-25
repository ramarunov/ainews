import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { parseWxr } from './lib/wxr-parser';
import { parseCsv } from './lib/csv';

// Cross-references a Google Search Console "Pages" export (Performance ->
// Search results -> Pages tab -> Export -> CSV) against what
// import-wordpress.ts actually imported, to find old URLs that still get
// real search traffic but don't resolve on the new site. Part of Fase 4
// (redirects/QA) of the migration plan:
// C:\Users\Administrator\.claude\plans\elegant-launching-noodle.md
//
// Splits findings into two files instead of one:
//   - AUTO_OUTPUT_FILE: high-confidence redirects this script is sure
//     about (nested WP category URLs flattened, author nicename -> real
//     slug) - feed straight into scripts/import-redirects.ts.
//   - REVIEW_OUTPUT_FILE: everything else that doesn't resolve, sorted by
//     traffic (clicks+impressions) so you can prioritize - this script has
//     no way to know what these SHOULD redirect to (a renamed post's new
//     slug, a deleted post's best replacement, ...), only that they don't
//     currently resolve. Fill in a toUrl column and feed the result into
//     import-redirects.ts too once you've reviewed it.
//
// Usage:
//   GSC_FILE=./GSC/Halaman.csv WXR_FILE=./export.xml ORG_SLUG=rusdimedia-local \
//     pnpm --filter api exec ts-node -r tsconfig-paths/register scripts/analyze-gsc-redirects.ts
//
// Env vars:
//   GSC_FILE            required - path to the GSC Pages CSV export
//                        (header column named "Halaman teratas"/"Top
//                        pages" or similar - Google localizes the header,
//                        so this reads column 0 positionally, not by name)
//   WXR_FILE             required - path to the same WordPress export used
//                        for import-wordpress.ts, for cross-referencing
//                        why a URL wasn't imported
//   ORG_SLUG             required - the target Organization's slug
//   SITE_HOST             the production hostname GSC URLs are filtered to
//                        - default "rusdimedia.com". Deliberately its own
//                        env var, not ROOT_DOMAIN: apps/api/.env sets
//                        ROOT_DOMAIN=localhost for local dev, and this
//                        script (via `import 'dotenv/config'`) would
//                        silently pick that up and filter out every real
//                        GSC row otherwise.
//   AUTO_OUTPUT_FILE     default "./gsc-redirects-auto.csv"
//   REVIEW_OUTPUT_FILE   default "./gsc-redirects-review.csv"
const prisma = new PrismaClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

interface GscRow {
  path: string;
  clicks: number;
  impressions: number;
}

function parseGscCsv(text: string, siteHost: string): GscRow[] {
  const rows = parseCsv(text);
  const byPath = new Map<string, GscRow>();

  // Skip the header row (rows[0]) - read positionally (Page/Klik/
  // Tayangan/Clicks/Impressions - Google localizes the header text itself)
  // rather than by name.
  for (const cols of rows.slice(1)) {
    const [urlStr, clicksStr, impressionsStr] = cols;
    if (!urlStr) continue;
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      continue;
    }
    if (siteHost && url.hostname !== siteHost && url.hostname !== `www.${siteHost}`) continue;

    // Normalize: strip trailing slash (except bare "/") so the slash and
    // non-slash variants Google indexed separately (confirmed live in
    // rusdimedia.com's export - the same path shows up twice) merge into
    // one entry - apps/web/proxy.ts already 301s the trailing-slash form
    // to this one anyway.
    let path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    if (url.search) path += url.search;

    const clicks = Number(clicksStr) || 0;
    const impressions = Number(impressionsStr) || 0;
    const existing = byPath.get(path);
    if (existing) {
      existing.clicks += clicks;
      existing.impressions += impressions;
    } else {
      byPath.set(path, { path, clicks, impressions });
    }
  }

  return [...byPath.values()];
}

async function main() {
  const gscFile = process.env.GSC_FILE;
  const wxrFile = process.env.WXR_FILE;
  const orgSlug = process.env.ORG_SLUG;
  if (!gscFile) throw new Error('GSC_FILE is required (path to the GSC Pages CSV export)');
  if (!wxrFile) throw new Error('WXR_FILE is required (path to the WordPress export)');
  if (!orgSlug) throw new Error('ORG_SLUG is required (the target Organization already exists)');
  const autoOutputFile = process.env.AUTO_OUTPUT_FILE ?? './gsc-redirects-auto.csv';
  const reviewOutputFile = process.env.REVIEW_OUTPUT_FILE ?? './gsc-redirects-review.csv';

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  if (!UUID_RE.test(org.id)) throw new Error(`Unexpected organization id shape: ${org.id}`);

  const siteHost = process.env.SITE_HOST ?? 'rusdimedia.com';
  const gscRows = parseGscCsv(readFileSync(gscFile, 'utf-8'), siteHost);
  console.log(`Parsed ${gscRows.length} distinct URL(s) from ${gscFile}.`);

  const { authors: wxrAuthors, posts: wxrPosts } = parseWxr(readFileSync(wxrFile, 'utf-8'));
  const wxrSlugInfo = new Map<string, { status: string; postType: string }>();
  for (const post of wxrPosts) {
    if (post.slug) wxrSlugInfo.set(post.slug, { status: post.status, postType: post.postType });
  }

  // Existing data, read inside one RLS-scoped transaction (see
  // scripts/lib/org-tx.ts's header comment on why `categories`/`tags`/
  // `articles`/`redirects` need this).
  const existing = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${org.id}'`);
    const [articles, pages, categories, tags, redirects] = await Promise.all([
      tx.article.findMany({ where: { organizationId: org.id }, select: { slug: true } }),
      tx.page.findMany({ where: { organizationId: org.id }, select: { slug: true } }),
      tx.category.findMany({ where: { organizationId: org.id }, select: { slug: true } }),
      tx.tag.findMany({ where: { organizationId: org.id }, select: { slug: true } }),
      tx.redirect.findMany({ where: { organizationId: org.id }, select: { fromPath: true } }),
    ]);
    return {
      articleSlugs: new Set<string>(articles.map((a: any) => a.slug)),
      pageSlugs: new Set<string>(pages.map((p: any) => p.slug)),
      categorySlugs: new Set<string>(categories.map((c: any) => c.slug)),
      tagSlugs: new Set<string>(tags.map((t: any) => t.slug)),
      redirectFromPaths: new Set<string>(redirects.map((r: any) => r.fromPath)),
    };
  });
  const users = await prisma.user.findMany({
    where: { organizationId: org.id, deletedAt: null },
    select: { email: true, slug: true },
  });
  const userSlugs = new Set(users.map((u) => u.slug).filter(Boolean) as string[]);

  // WP's author-archive URL uses the login/nicename, not our display-name-
  // derived slug (e.g. WordPress `/author/admin/` vs this app's
  // `/author/ghallaby-zasy` for the same person) - match WXR authors to
  // real users by email (same matching import-wordpress.ts itself uses)
  // to bridge the two.
  const authorLoginToRealSlug = new Map<string, string>();
  for (const author of wxrAuthors) {
    const email = author.email.toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === email);
    if (user?.slug) authorLoginToRealSlug.set(author.login, user.slug);
  }

  // The prior WordPress install used different archive-path prefixes than
  // this app's routes: plural "/tags/" instead of "/tag/", Indonesian
  // "/kategori/" instead of "/category/", and static Pages under
  // "/pages/{slug}" instead of flat "/{slug}". apps/web/proxy.ts now 301s
  // all three generically (its WP_PREFIX_ALIASES), so a GSC row under one of
  // these prefixes needs no Redirect-table row of its own - just alias it to
  // the equivalent path here so the checks below can tell whether the
  // aliased target actually resolves, same as a plain /category//tag/ URL.
  const WP_PREFIX_ALIASES: Array<[string, string]> = [
    ['/kategori/', '/category/'],
    ['/tags/', '/tag/'],
    ['/pages/', '/'],
  ];

  const autoRows: { fromPath: string; toUrl: string; statusCode: number; note: string }[] = [];
  const reviewRows: { fromPath: string; clicks: number; impressions: number; reason: string; suggestedToUrl: string }[] = [];

  // Mirrors apps/web/proxy.ts's PAGE_NUMBER_PATTERN, which runs (and
  // redirects) before its own prefix-alias check - so a path like
  // "/tags/video-bokeh/page/2" resolves in two live hops: this pattern
  // strips first (-> "/tags/video-bokeh?page=2", discarding any query the
  // original URL already had, same as proxy.ts), then the prefix-alias loop
  // below converts the plural prefix. Without replicating this here, the
  // prefix-alias loop would wrongly treat the trailing page number itself as
  // the tag/category slug.
  const PAGE_NUMBER_PATTERN = /^(.*)\/page\/(\d+)\/?$/;

  for (const row of gscRows) {
    let [pathname, query = ''] = row.path.split(/(?=\?)/);
    if (pathname === '/') continue;
    if (existing.redirectFromPaths.has(pathname)) continue; // already handled

    const pageMatch = PAGE_NUMBER_PATTERN.exec(pathname);
    if (pageMatch) {
      pathname = pageMatch[1] || '/';
      query = `?page=${pageMatch[2]}`;
    }
    // Bare WordPress homepage pagination ("/page/2", no category/tag prefix)
    // strips down to "/" above - already handled generically by proxy.ts's
    // own PAGE_NUMBER_PATTERN, no Redirect row needed.
    if (pathname === '/') continue;

    let aliasOrigin = '';
    for (const [from, to] of WP_PREFIX_ALIASES) {
      if (!pathname.startsWith(from)) continue;
      const tailSegments = pathname.slice(from.length).split('/').filter(Boolean);
      const leaf = tailSegments[tailSegments.length - 1];
      if (!leaf) break;
      aliasOrigin = from;
      pathname = `${to}${leaf}`;
      break;
    }
    const aliasSuffix = aliasOrigin
      ? ` (requested via WordPress's "${aliasOrigin}" prefix - proxy.ts aliases this generically, so if it resolves once created/fixed it needs no Redirect row of its own)`
      : '';

    const segments = pathname.split('/').filter(Boolean);

    // /category/{a}/{b}/... - WordPress's nested category URL; this app's
    // categories are always flat (/category/{slug}, see
    // apps/web/lib/site-url.ts's getCategoryUrl) regardless of parent/
    // child depth, so only the LAST segment matters.
    if (segments[0] === 'category' && segments.length > 2) {
      const leaf = segments[segments.length - 1];
      if (existing.categorySlugs.has(leaf)) {
        // Aliased from /kategori/... - proxy.ts's WP_PREFIX_ALIASES already
        // flattens nested /kategori/ paths to the last segment generically,
        // same as this branch does by hand for plain /category/... paths -
        // no Redirect row needed on top of that.
        if (!aliasOrigin) {
          autoRows.push({
            fromPath: pathname,
            toUrl: `/category/${leaf}${query}`,
            statusCode: 301,
            note: `Nested WordPress category path (was ${segments.length} levels deep), flattened`,
          });
        }
      } else {
        reviewRows.push({
          fromPath: row.path,
          clicks: row.clicks,
          impressions: row.impressions,
          reason: `Nested category path, but "${leaf}" doesn't match any current category slug${aliasSuffix}`,
          suggestedToUrl: '',
        });
      }
      continue;
    }

    if (segments[0] === 'category' && segments.length === 2) {
      if (existing.categorySlugs.has(segments[1])) continue; // already resolves
      reviewRows.push({
        fromPath: row.path,
        clicks: row.clicks,
        impressions: row.impressions,
        reason: `Category slug "${segments[1]}" no longer exists${aliasSuffix}`,
        suggestedToUrl: '',
      });
      continue;
    }

    if (segments[0] === 'tag' && segments.length === 2) {
      if (existing.tagSlugs.has(segments[1])) continue; // already resolves
      reviewRows.push({
        fromPath: row.path,
        clicks: row.clicks,
        impressions: row.impressions,
        reason: `Tag slug "${segments[1]}" no longer exists${aliasSuffix}`,
        suggestedToUrl: '',
      });
      continue;
    }

    if (segments[0] === 'author' && segments.length === 2) {
      const nicename = segments[1];
      if (userSlugs.has(nicename)) continue; // already resolves
      const realSlug = authorLoginToRealSlug.get(nicename);
      if (realSlug) {
        autoRows.push({
          fromPath: pathname,
          toUrl: `/author/${realSlug}`,
          statusCode: 301,
          note: `WordPress author nicename "${nicename}" -> this app's slug for the same person (matched by email)`,
        });
      } else {
        reviewRows.push({
          fromPath: row.path,
          clicks: row.clicks,
          impressions: row.impressions,
          reason: `Author "${nicename}" doesn't match any imported user`,
          suggestedToUrl: '',
        });
      }
      continue;
    }

    // Single-segment: a candidate flat article/page slug.
    if (segments.length === 1) {
      const slug = segments[0];
      if (existing.articleSlugs.has(slug) || existing.pageSlugs.has(slug)) continue; // already resolves

      const wxrInfo = wxrSlugInfo.get(slug);
      reviewRows.push({
        fromPath: row.path,
        clicks: row.clicks,
        impressions: row.impressions,
        reason:
          (wxrInfo
            ? `In the WordPress export as a ${wxrInfo.postType} with status "${wxrInfo.status}" (not imported - only published posts/pages are) - either redirect to "/" or re-import this one deliberately`
            : 'No matching content in the WordPress export at all (renamed/deleted before export, or never a real post) - likely needs a manual redirect target') + aliasSuffix,
        suggestedToUrl: '',
      });
      continue;
    }

    // Anything else (other multi-segment shapes: /feed/..., /wp-json/...,
    // attachment sub-pages, ...) - no confident automatic handling.
    reviewRows.push({
      fromPath: row.path,
      clicks: row.clicks,
      impressions: row.impressions,
      reason: 'Unrecognized URL shape - not a category/tag/author/flat-slug pattern' + aliasSuffix,
      suggestedToUrl: '',
    });
  }

  reviewRows.sort((a, b) => b.clicks + b.impressions - (a.clicks + a.impressions));

  const autoHeader = 'fromPath,toUrl,statusCode,note';
  writeFileSync(
    autoOutputFile,
    [autoHeader, ...autoRows.map((r) => [r.fromPath, r.toUrl, r.statusCode, r.note].map((v) => csvEscape(String(v))).join(','))].join('\n'),
    'utf-8',
  );

  const reviewHeader = 'fromPath,clicks,impressions,reason,suggestedToUrl';
  writeFileSync(
    reviewOutputFile,
    [reviewHeader, ...reviewRows.map((r) => [r.fromPath, r.clicks, r.impressions, r.reason, r.suggestedToUrl].map((v) => csvEscape(String(v))).join(','))].join('\n'),
    'utf-8',
  );

  console.log(`\n${autoRows.length} high-confidence redirect(s) written to ${autoOutputFile} - ready for import-redirects.ts as-is.`);
  console.log(`${reviewRows.length} URL(s) need manual review, written to ${reviewOutputFile} (sorted by traffic, highest first).`);
  console.log(
    `\nNote: this only checked URLs that already showed up in Google's data - it can't tell you about old URLs\n` +
      `that get direct/referral traffic but were never indexed. Once real hosting exists, apps/api's NotFoundLog\n` +
      `table (see apps/web/app/(dashboard)/(authenticated)/redirects/page.tsx's 404 monitor) will surface those\n` +
      `after cutover as real visitors actually hit them.`,
  );
}

main()
  .catch((err) => {
    console.error('Analysis failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
