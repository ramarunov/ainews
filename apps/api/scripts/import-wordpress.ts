import 'dotenv/config';
import { readFileSync } from 'fs';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { PrismaClient, ArticleStatus } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import slugify from 'slugify';

import { sanitizeArticleHtml } from '../src/common/sanitize-html';
import { parseWxr, looksLikeUnrenderedContent } from './lib/wxr-parser';
import { createWithOrgTx } from './lib/org-tx';

// Imports a WordPress "WXR" export (Tools -> Export -> All content, an XML
// file) into an existing Organization - articles/categories/tags/authors,
// preserving WP's exact slugs so rusdimedia.com's existing flat `/{slug}`
// URLs (see apps/web/lib/site-url.ts) keep resolving unchanged. Migration
// plan: C:\Users\Administrator\.claude\plans\elegant-launching-noodle.md
// (Fase 3).
//
// Usage:
//   ORG_SLUG=rusdimedia-local WXR_FILE=./export.xml \
//     pnpm --filter api exec ts-node -r tsconfig-paths/register scripts/import-wordpress.ts
//
// Env vars:
//   WXR_FILE           required - path to the exported .xml file
//   ORG_SLUG            required - the target Organization's slug (create it
//                        first with scripts/bootstrap-org.ts, this script
//                        does not create organizations)
//   DRY_RUN              "true" to parse and report counts without writing
//                        anything to the database or uploading any media -
//                        default "true" (run once as a dry run before the
//                        real import, since this can't be un-imported
//                        cleanly)
//   DOWNLOAD_MEDIA       "true" to download and re-host every image
//                        referenced (featured images + inline <img> tags)
//                        to this app's own media storage - default "true".
//                        Set "false" to leave image URLs pointing at the
//                        old WordPress site (only useful short-term, before
//                        DNS cutover, since those URLs go away once the old
//                        host is decommissioned).
//   IMPORT_LANGUAGE     BCP-47 language code stored on every imported
//                        article - default "id".
//   LIMIT                cap the number of posts imported, for a quick
//                        test run - default unlimited.
//   DEFAULT_AUTHOR_EMAIL fallback email domain-part for a WP author with no
//                        <wp:author_email> - default "imported.invalid".
//
// Safe to interrupt and re-run: every post/page is its own short-lived
// transaction (see withOrgTx, scripts/lib/org-tx.ts), not one transaction
// for the whole import - a crash, Ctrl-C, or Prisma's interactive-
// transaction timeout only loses the one item in flight, not everything
// already committed, and re-running just skips what's already there (see
// the `existing` checks).
//
// See also scripts/generate-redirect-suggestions.ts, which reuses this
// same WXR parser to find old WordPress URLs that need a Redirect row
// (theme utility pages that got skipped here, reserved-slug collisions,
// ...) - run it against the same export after this script finishes.
const prisma = new PrismaClient();
const withOrgTx = createWithOrgTx(prisma);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors apps/web/proxy.ts's PUBLIC_PATH_PREFIXES / ArticlesService's
// RESERVED_FLAT_SLUGS - an imported article whose WP slug collided with one
// of these would be permanently unreachable at its own flat `/{slug}` URL.
const RESERVED_FLAT_SLUGS = new Set([
  'news', 'category', 'tag', 'author', 'search', 'feed',
  'sitemap.xml', 'news-sitemap.xml', 'image-sitemap.xml',
  'robots.txt', 'ads.txt', 'llms.txt', 'icon', 'apple-icon',
]);

// ─── Media re-hosting ───────────────────────────────────────────────────────

let s3: S3Client | null = null;
function getS3(): S3Client {
  if (s3) return s3;
  s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
    forcePathStyle: true,
  });
  return s3;
}

function getPublicUrl(key: string): string {
  const base = process.env.CDN_URL || process.env.S3_PUBLIC_URL || '';
  return `${base}/${key}`;
}

// Downloads one image and re-hosts it on this app's own media storage -
// mirrors apps/api/src/infrastructure/storage/storage.service.ts's upload()
// logic directly (a standalone script, not the full NestJS app, so it's not
// worth wiring up ConfigService/StorageService DI for this one call).
// Returns null (leaving the caller to fall back to the original URL) on any
// failure - a single missing/unreachable old image must not abort the whole
// import.
//
// The network download + S3 upload deliberately happen OUTSIDE any DB
// transaction (they can each take seconds, and thousands of them across a
// full import would hold a transaction open for hours otherwise - this is
// exactly what caused the P2028 "transaction expired" failure the first
// version of this script hit against the real export). Only the final
// `mediaFile.create` needs the RLS-scoped transaction, via withOrgTx.
const mediaUrlCache = new Map<string, { id: string; url: string } | null>();

async function rehostImage(
  sourceUrl: string,
  organizationId: string,
  uploadedBy: string,
  dryRun: boolean,
): Promise<{ id: string; url: string } | null> {
  if (mediaUrlCache.has(sourceUrl)) return mediaUrlCache.get(sourceUrl)!;
  if (dryRun) return { id: 'dry-run', url: sourceUrl };

  try {
    const response = await axios.get<ArrayBuffer>(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 20_000,
      maxContentLength: 25 * 1024 * 1024,
    });
    const buffer = Buffer.from(response.data);
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !detected.mime.startsWith('image/')) {
      console.warn(`  [media] skipped (not a recognized image): ${sourceUrl}`);
      mediaUrlCache.set(sourceUrl, null);
      return null;
    }

    const ext = extname(new URL(sourceUrl).pathname) || `.${detected.ext}`;
    const key = `${organizationId}/imported/${uuidv4()}${ext}`;
    await getS3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET ?? 'ainews-media',
        Key: key,
        Body: buffer,
        ContentType: detected.mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    const url = getPublicUrl(key);

    const media: any = await withOrgTx(organizationId, (tx: any) =>
      tx.mediaFile.create({
        data: {
          organizationId,
          uploadedBy,
          filename: key.split('/').pop()!,
          originalName: sourceUrl.split('/').pop() || 'imported-image',
          mimeType: detected.mime,
          fileSize: BigInt(buffer.byteLength),
          storageKey: key,
          storageBucket: process.env.S3_BUCKET ?? 'ainews-media',
          publicUrl: url,
          folder: '/imported',
        },
      }),
    );

    const result = { id: media.id, url };
    mediaUrlCache.set(sourceUrl, result);
    return result;
  } catch (err: any) {
    console.warn(`  [media] failed to re-host ${sourceUrl}: ${err.message}`);
    mediaUrlCache.set(sourceUrl, null);
    return null;
  }
}

// Rewrites every <img src="..."> in imported content that points at the old
// WordPress site's /wp-content/uploads/ path to the newly re-hosted URL,
// downloading each distinct image at most once (rehostImage caches by URL).
async function rehostInlineImages(
  html: string,
  organizationId: string,
  uploadedBy: string,
  dryRun: boolean,
): Promise<string> {
  const $ = cheerio.load(html, { xmlMode: false });
  const imgs = $('img').toArray();
  for (const img of imgs) {
    const src = $(img).attr('src');
    if (!src) continue;
    const rehosted = await rehostImage(src, organizationId, uploadedBy, dryRun);
    if (rehosted) $(img).attr('src', rehosted.url);
  }
  return $.html();
}

// ─── Slug helpers ───────────────────────────────────────────────────────────

async function ensureUniqueSlug(
  client: any,
  table: 'article' | 'user' | 'category' | 'tag',
  organizationId: string,
  desiredSlug: string,
): Promise<string> {
  const base = (slugify(desiredSlug, { lower: true, strict: true, trim: true }) || 'item').substring(
    0,
    200,
  );
  let slug = base;
  let counter = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await client[table].findFirst({ where: { organizationId, slug } });
    if (!existing) break;
    slug = `${base}-${counter++}`;
  }
  return slug;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const wxrFile = process.env.WXR_FILE;
  const orgSlug = process.env.ORG_SLUG;
  if (!wxrFile) throw new Error('WXR_FILE is required (path to the exported .xml file)');
  if (!orgSlug) throw new Error('ORG_SLUG is required (the target Organization already exists)');

  const dryRun = process.env.DRY_RUN !== 'false'; // defaults to true - opt OUT explicitly
  const downloadMedia = process.env.DOWNLOAD_MEDIA !== 'false';
  const language = process.env.IMPORT_LANGUAGE ?? 'id';
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
  const fallbackEmailDomain = process.env.DEFAULT_AUTHOR_EMAIL ?? 'imported.invalid';

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Importing ${wxrFile} into org "${orgSlug}"...`);

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  if (!UUID_RE.test(org.id)) throw new Error(`Unexpected organization id shape: ${org.id}`);

  // The user who "uploaded" every re-hosted image and, as a last resort,
  // authors any post whose WP creator can't be resolved - the org's first
  // superadmin (created by bootstrap-org.ts).
  const systemUser = await prisma.user.findFirstOrThrow({
    where: { organizationId: org.id, isSuperadmin: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  const xml = readFileSync(wxrFile, 'utf-8');
  const { authors, categories, tags, posts, attachmentUrls } = parseWxr(xml);

  console.log(
    `Parsed: ${authors.length} author(s), ${categories.length} categor(y/ies), ` +
      `${tags.length} tag(s), ${posts.length} post/page item(s) (all statuses), ` +
      `${attachmentUrls.size} attachment(s).`,
  );

  const stats = {
    usersCreated: 0,
    usersMatched: 0,
    categoriesUpserted: 0,
    tagsUpserted: 0,
    articlesCreated: 0,
    articlesSkippedExisting: 0,
    articlesSkippedNotPublished: 0,
    pagesCreated: 0,
    pagesSkippedExisting: 0,
    skippedUnrenderedContent: 0,
    failed: 0,
  };

  // ── Authors ── `users` isn't RLS-protected, so the plain client is fine.
  const authorIdByLogin = new Map<string, string>();
  for (const author of authors) {
    const email = (author.email || `${author.login}@${fallbackEmailDomain}`).toLowerCase();
    let user = await prisma.user.findFirst({ where: { organizationId: org.id, email } });

    if (!user) {
      let firstName = author.firstName;
      let lastName = author.lastName;
      if (!firstName && !lastName) {
        const parts = (author.displayName || author.login).trim().split(/\s+/);
        firstName = parts[0] || author.login;
        lastName = parts.slice(1).join(' ');
      }
      const displayName = author.displayName || `${firstName} ${lastName}`.trim();
      const slug = await ensureUniqueSlug(prisma, 'user', org.id, displayName || author.login);

      if (!dryRun) {
        user = await prisma.user.create({
          data: {
            organizationId: org.id,
            email,
            firstName: firstName || author.login,
            lastName: lastName || '',
            displayName,
            slug,
            isActive: true,
            // No passwordHash - an imported author can't log in until an
            // admin invites them for real (matches an OAuth-only account's
            // shape, already supported elsewhere).
          },
        });
      }
      stats.usersCreated++;
    } else {
      stats.usersMatched++;
    }
    if (user) authorIdByLogin.set(author.login, user.id);
  }

  // ── Categories & Tags ── RLS-protected, but pure DB work (no network) -
  // one transaction each is fine, they finish in well under its timeout
  // even at several thousand rows.
  const categoryIdByNicename = new Map<string, string>();
  const tagIdBySlug = new Map<string, string>();

  await withOrgTx(org.id, async (tx) => {
    const remaining = [...categories];
    let guard = remaining.length + 1;
    while (remaining.length > 0 && guard-- > 0) {
      const idx = remaining.findIndex(
        (c) => !c.parentNicename || categoryIdByNicename.has(c.parentNicename),
      );
      if (idx === -1) break; // orphaned parent reference - import as top-level below
      const [cat] = remaining.splice(idx, 1);
      const parentId = cat.parentNicename ? categoryIdByNicename.get(cat.parentNicename) : undefined;

      if (!dryRun) {
        const category = await tx.category.upsert({
          where: { organizationId_slug: { organizationId: org.id, slug: cat.nicename } },
          update: { name: cat.name, parentId },
          create: { organizationId: org.id, slug: cat.nicename, name: cat.name, parentId },
        });
        categoryIdByNicename.set(cat.nicename, category.id);
      } else {
        categoryIdByNicename.set(cat.nicename, `dry-run:${cat.nicename}`);
      }
      stats.categoriesUpserted++;
    }
    // Anything left has an unresolvable parent chain - import flat.
    for (const cat of remaining) {
      if (!dryRun) {
        const category = await tx.category.upsert({
          where: { organizationId_slug: { organizationId: org.id, slug: cat.nicename } },
          update: { name: cat.name },
          create: { organizationId: org.id, slug: cat.nicename, name: cat.name },
        });
        categoryIdByNicename.set(cat.nicename, category.id);
      } else {
        categoryIdByNicename.set(cat.nicename, `dry-run:${cat.nicename}`);
      }
      stats.categoriesUpserted++;
    }
  });

  await withOrgTx(org.id, async (tx) => {
    for (const tag of tags) {
      if (!dryRun) {
        const created = await tx.tag.upsert({
          where: { organizationId_slug: { organizationId: org.id, slug: tag.slug } },
          update: { name: tag.name },
          create: { organizationId: org.id, slug: tag.slug, name: tag.name },
        });
        tagIdBySlug.set(tag.slug, created.id);
      } else {
        tagIdBySlug.set(tag.slug, `dry-run:${tag.slug}`);
      }
      stats.tagsUpserted++;
    }
  });

  // ── Posts & Pages ── one item at a time: a cheap existing-check first (so
  // a re-run skips already-imported items without re-downloading their
  // images), then the slow media work OUTSIDE any transaction, then a
  // short transaction for the final write.
  let imported = 0;
  for (const post of posts) {
    if (imported >= limit) break;

    if (post.status !== 'publish') {
      stats.articlesSkippedNotPublished++;
      continue;
    }
    if (!post.slug) {
      console.warn(`  [skip] post ${post.postId} ("${post.title}") has no wp:post_name slug`);
      stats.failed++;
      continue;
    }
    if (looksLikeUnrenderedContent(post.content)) {
      console.warn(
        `  [skip] "${post.slug}" looks like unrendered page-builder shortcode or empty content, not real prose - not imported`,
      );
      stats.skippedUnrenderedContent++;
      continue;
    }

    try {
      if (post.postType === 'page') {
        // `pages` isn't RLS-protected - plain client, no transaction needed
        // for a single insert with no related rows.
        const existing = await prisma.page.findFirst({
          where: { organizationId: org.id, slug: post.slug },
        });
        if (existing) {
          stats.pagesSkippedExisting++;
          continue;
        }

        const content = downloadMedia
          ? await rehostInlineImages(post.content, org.id, systemUser.id, dryRun)
          : post.content;

        if (!dryRun) {
          await prisma.page.create({
            data: {
              organizationId: org.id,
              slug: post.slug,
              title: post.title,
              content: sanitizeArticleHtml(content),
              metaTitle: post.metaTitle ?? undefined,
              metaDescription: post.metaDescription ?? undefined,
              isPublished: true,
            },
          });
        }
        stats.pagesCreated++;
        imported++;
        continue;
      }

      // post.postType === 'post'
      let slug = post.slug;
      if (RESERVED_FLAT_SLUGS.has(slug)) {
        console.warn(`  [warn] "${slug}" collides with a reserved path - imported as "${slug}-imported"`);
        slug = `${slug}-imported`;
      }

      const existing = await withOrgTx(org.id, (tx) =>
        tx.article.findFirst({ where: { organizationId: org.id, slug } }),
      );
      if (existing) {
        stats.articlesSkippedExisting++;
        continue;
      }

      const authorId = authorIdByLogin.get(post.creatorLogin) ?? systemUser.id;

      const primaryCategoryNicename = post.categoryNicenames[0];
      const primaryCategoryId = primaryCategoryNicename
        ? categoryIdByNicename.get(primaryCategoryNicename)
        : undefined;

      // Slow network work - deliberately outside any transaction.
      let featuredImageId: string | undefined;
      let featuredImageUrl: string | undefined;
      const thumbnailUrl = post.thumbnailAttachmentId
        ? attachmentUrls.get(post.thumbnailAttachmentId)
        : undefined;
      if (thumbnailUrl) {
        if (downloadMedia) {
          const rehosted = await rehostImage(thumbnailUrl, org.id, systemUser.id, dryRun);
          if (rehosted) {
            featuredImageId = rehosted.id;
            featuredImageUrl = rehosted.url;
          }
        } else {
          featuredImageUrl = thumbnailUrl;
        }
      }

      const content = downloadMedia
        ? await rehostInlineImages(post.content, org.id, systemUser.id, dryRun)
        : post.content;
      const sanitizedContent = sanitizeArticleHtml(content);
      const wordCount = sanitizedContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean).length;
      const readingTime = Math.ceil(wordCount / 200);
      const excerpt = sanitizeArticleHtml(post.excerpt).replace(/<[^>]+>/g, '').trim() || undefined;

      if (!dryRun) {
        const articleId = await withOrgTx(org.id, async (tx) => {
          const article = await tx.article.create({
            data: {
              organizationId: org.id,
              primaryAuthorId: authorId,
              primaryCategoryId,
              title: post.title,
              slug,
              excerpt,
              content: sanitizedContent,
              wordCount,
              readingTime,
              revisionCount: 1,
              language,
              status: ArticleStatus.PUBLISHED,
              publishedAt: post.publishedAt,
              featuredImageId,
              featuredImageUrl,
              sourceUrl: post.link || undefined,
              sourceName: 'WordPress Import',
              ...(primaryCategoryId && {
                articleCategories: {
                  create: { categoryId: primaryCategoryId, isPrimary: true, sortOrder: 0 },
                },
              }),
            },
          });

          const extraCategoryNicenames = post.categoryNicenames.slice(1);
          for (const [idx, nicename] of extraCategoryNicenames.entries()) {
            const categoryId = categoryIdByNicename.get(nicename);
            if (!categoryId) continue;
            await tx.articleCategory.create({
              data: { articleId: article.id, categoryId, isPrimary: false, sortOrder: idx + 1 },
            });
          }

          for (const [idx, tagSlug] of post.tagSlugs.entries()) {
            const tagId = tagIdBySlug.get(tagSlug);
            if (!tagId) continue;
            await tx.articleTag.create({
              data: { articleId: article.id, tagId, sortOrder: idx },
            });
          }

          return article.id as string;
        });

        // `article_seo` isn't RLS-protected - plain client, outside the
        // transaction above.
        if (post.metaTitle || post.metaDescription) {
          await prisma.articleSeo.create({
            data: {
              articleId,
              metaTitle: post.metaTitle ?? undefined,
              metaDescription: post.metaDescription ?? undefined,
              canonicalUrl: `https://${process.env.ROOT_DOMAIN ?? 'rusdimedia.com'}/${slug}`,
            },
          });
        }
      }

      stats.articlesCreated++;
      imported++;
      if (imported % 100 === 0) {
        console.log(`  ... ${imported} imported so far`);
      }
    } catch (err: any) {
      console.error(`  [failed] "${post.title}" (${post.slug}): ${err.message}`);
      stats.failed++;
    }
  }

  console.log('\n' + (dryRun ? 'Dry run complete (nothing was written).' : 'Import complete.'));
  console.table(stats);
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
