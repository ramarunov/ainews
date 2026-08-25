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
const prisma = new PrismaClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors apps/web/proxy.ts's PUBLIC_PATH_PREFIXES / ArticlesService's
// RESERVED_FLAT_SLUGS - an imported article whose WP slug collided with one
// of these would be permanently unreachable at its own flat `/{slug}` URL.
const RESERVED_FLAT_SLUGS = new Set([
  'news', 'category', 'tag', 'author', 'search', 'feed',
  'sitemap.xml', 'news-sitemap.xml', 'image-sitemap.xml',
  'robots.txt', 'ads.txt', 'llms.txt', 'icon', 'apple-icon',
]);

interface WpAuthor {
  login: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
}

interface WpCategory {
  nicename: string;
  name: string;
  parentNicename: string | null;
}

interface WpTag {
  slug: string;
  name: string;
}

interface WpPost {
  postId: string;
  postType: 'post' | 'page';
  status: string;
  title: string;
  slug: string;
  link: string;
  content: string;
  excerpt: string;
  creatorLogin: string;
  publishedAt: Date;
  categoryNicenames: string[];
  tagSlugs: string[];
  thumbnailAttachmentId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

function decodeAndTrim(text: string): string {
  return text.trim();
}

function parseWpDate(item: cheerio.Cheerio<any>): Date {
  const gmt = item.find('wp\\:post_date_gmt').first().text().trim();
  if (gmt && gmt !== '0000-00-00 00:00:00') {
    return new Date(gmt.replace(' ', 'T') + 'Z');
  }
  const local = item.find('wp\\:post_date').first().text().trim();
  if (local && local !== '0000-00-00 00:00:00') {
    return new Date(local.replace(' ', 'T'));
  }
  return new Date();
}

function parseWxr(xml: string) {
  const $ = cheerio.load(xml, { xmlMode: true });

  const authors: WpAuthor[] = $('wp\\:author')
    .map((_, el) => {
      const a = $(el);
      return {
        login: decodeAndTrim(a.find('wp\\:author_login').text()),
        email: decodeAndTrim(a.find('wp\\:author_email').text()),
        displayName: decodeAndTrim(a.find('wp\\:author_display_name').text()),
        firstName: decodeAndTrim(a.find('wp\\:author_first_name').text()),
        lastName: decodeAndTrim(a.find('wp\\:author_last_name').text()),
      };
    })
    .get();

  const categories: WpCategory[] = $('wp\\:category')
    .map((_, el) => {
      const c = $(el);
      const parent = decodeAndTrim(c.find('wp\\:category_parent').text());
      return {
        nicename: decodeAndTrim(c.find('wp\\:category_nicename').text()),
        name: decodeAndTrim(c.find('wp\\:cat_name').text()),
        parentNicename: parent || null,
      };
    })
    .get();

  const tags: WpTag[] = $('wp\\:tag')
    .map((_, el) => {
      const t = $(el);
      return {
        slug: decodeAndTrim(t.find('wp\\:tag_slug').text()),
        name: decodeAndTrim(t.find('wp\\:tag_name').text()),
      };
    })
    .get();

  // Attachments are their own <item>s (wp:post_type = attachment) - build a
  // postId -> URL map so a post's `_thumbnail_id` postmeta can be resolved.
  const attachmentUrls = new Map<string, string>();
  $('item').each((_, el) => {
    const item = $(el);
    const postType = item.find('wp\\:post_type').first().text().trim();
    if (postType !== 'attachment') return;
    const postId = item.find('wp\\:post_id').first().text().trim();
    const url = item.find('wp\\:attachment_url').first().text().trim();
    if (postId && url) attachmentUrls.set(postId, url);
  });

  const posts: WpPost[] = [];
  $('item').each((_, el) => {
    const item = $(el);
    const postType = item.find('wp\\:post_type').first().text().trim();
    if (postType !== 'post' && postType !== 'page') return;

    const postmeta = new Map<string, string>();
    item.find('wp\\:postmeta').each((_, metaEl) => {
      const meta = $(metaEl);
      const key = meta.find('wp\\:meta_key').first().text().trim();
      const value = meta.find('wp\\:meta_value').first().text();
      if (key) postmeta.set(key, value);
    });

    const categoryNicenames = item
      .find('category[domain="category"]')
      .map((_, catEl) => $(catEl).attr('nicename') ?? '')
      .get()
      .filter(Boolean);

    const tagSlugs = item
      .find('category[domain="post_tag"]')
      .map((_, tagEl) => $(tagEl).attr('nicename') ?? '')
      .get()
      .filter(Boolean);

    const metaTitle =
      postmeta.get('_yoast_wpseo_title') || postmeta.get('rank_math_title') || null;
    const metaDescription =
      postmeta.get('_yoast_wpseo_metadesc') || postmeta.get('rank_math_description') || null;

    posts.push({
      postId: item.find('wp\\:post_id').first().text().trim(),
      postType,
      status: item.find('wp\\:status').first().text().trim(),
      title: decodeAndTrim(item.find('title').first().text()),
      slug: decodeAndTrim(item.find('wp\\:post_name').first().text()),
      link: decodeAndTrim(item.find('link').first().text()),
      content: item.find('content\\:encoded').first().text(),
      excerpt: item.find('excerpt\\:encoded').first().text(),
      creatorLogin: decodeAndTrim(item.find('dc\\:creator').first().text()),
      publishedAt: parseWpDate(item),
      categoryNicenames,
      tagSlugs,
      thumbnailAttachmentId: postmeta.get('_thumbnail_id') ?? null,
      metaTitle: metaTitle ? decodeAndTrim(metaTitle) : null,
      metaDescription: metaDescription ? decodeAndTrim(metaDescription) : null,
    });
  });

  return { authors, categories, tags, posts, attachmentUrls };
}

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
// import. Takes `tx` (not the module-level `prisma`) so the `mediaFile.create`
// runs inside the same RLS-scoped transaction as everything else (see
// main()'s `SET LOCAL app.current_org_id`) - `media_files` has
// FORCE ROW LEVEL SECURITY, so writing through the plain client fails closed.
const mediaUrlCache = new Map<string, { id: string; url: string } | null>();

async function rehostImage(
  tx: any,
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

    const media = await tx.mediaFile.create({
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
    });

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
  tx: any,
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
    const rehosted = await rehostImage(tx, src, organizationId, uploadedBy, dryRun);
    if (rehosted) $(img).attr('src', rehosted.url);
  }
  return $.html();
}

// ─── Slug helpers ───────────────────────────────────────────────────────────

async function ensureUniqueSlug(
  tx: any,
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
    const existing = await tx[table].findFirst({ where: { organizationId, slug } });
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
    failed: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${org.id}'`);

      // ── Authors ──────────────────────────────────────────────────────────
      const authorIdByLogin = new Map<string, string>();
      for (const author of authors) {
        const email = (author.email || `${author.login}@${fallbackEmailDomain}`).toLowerCase();
        let user = await tx.user.findFirst({ where: { organizationId: org.id, email } });

        if (!user) {
          let firstName = author.firstName;
          let lastName = author.lastName;
          if (!firstName && !lastName) {
            const parts = (author.displayName || author.login).trim().split(/\s+/);
            firstName = parts[0] || author.login;
            lastName = parts.slice(1).join(' ');
          }
          const displayName = author.displayName || `${firstName} ${lastName}`.trim();
          const slug = await ensureUniqueSlug(tx, 'user', org.id, displayName || author.login);

          if (!dryRun) {
            user = await tx.user.create({
              data: {
                organizationId: org.id,
                email,
                firstName: firstName || author.login,
                lastName: lastName || '',
                displayName,
                slug,
                isActive: true,
                // No passwordHash - an imported author can't log in until an
                // admin invites them for real (matches an OAuth-only
                // account's shape, already supported elsewhere).
              },
            });
          }
          stats.usersCreated++;
        } else {
          stats.usersMatched++;
        }
        if (user) authorIdByLogin.set(author.login, user.id);
      }

      // ── Categories (parents before children) ────────────────────────────
      const categoryIdByNicename = new Map<string, string>();
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

      // ── Tags ─────────────────────────────────────────────────────────────
      const tagIdBySlug = new Map<string, string>();
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

      // ── Posts & Pages ────────────────────────────────────────────────────
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

        try {
          if (post.postType === 'page') {
            const existing = await tx.page.findFirst({
              where: { organizationId: org.id, slug: post.slug },
            });
            if (existing) {
              stats.pagesSkippedExisting++;
              continue;
            }

            const content = downloadMedia
              ? await rehostInlineImages(tx, post.content, org.id, systemUser.id, dryRun)
              : post.content;

            if (!dryRun) {
              await tx.page.create({
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

          const existing = await tx.article.findFirst({
            where: { organizationId: org.id, slug },
          });
          if (existing) {
            stats.articlesSkippedExisting++;
            continue;
          }

          const authorId = authorIdByLogin.get(post.creatorLogin) ?? systemUser.id;

          const primaryCategoryNicename = post.categoryNicenames[0];
          const primaryCategoryId = primaryCategoryNicename
            ? categoryIdByNicename.get(primaryCategoryNicename)
            : undefined;

          let featuredImageId: string | undefined;
          let featuredImageUrl: string | undefined;
          const thumbnailUrl = post.thumbnailAttachmentId
            ? attachmentUrls.get(post.thumbnailAttachmentId)
            : undefined;
          if (thumbnailUrl) {
            if (downloadMedia) {
              const rehosted = await rehostImage(tx, thumbnailUrl, org.id, systemUser.id, dryRun);
              if (rehosted) {
                featuredImageId = rehosted.id;
                featuredImageUrl = rehosted.url;
              }
            } else {
              featuredImageUrl = thumbnailUrl;
            }
          }

          const content = downloadMedia
            ? await rehostInlineImages(tx, post.content, org.id, systemUser.id, dryRun)
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

            if (post.metaTitle || post.metaDescription) {
              await tx.articleSeo.create({
                data: {
                  articleId: article.id,
                  metaTitle: post.metaTitle ?? undefined,
                  metaDescription: post.metaDescription ?? undefined,
                  canonicalUrl: `https://${process.env.ROOT_DOMAIN ?? 'rusdimedia.com'}/${slug}`,
                },
              });
            }
          }

          stats.articlesCreated++;
          imported++;
        } catch (err: any) {
          console.error(`  [failed] "${post.title}" (${post.slug}): ${err.message}`);
          stats.failed++;
        }
      }
    },
    { timeout: 600_000 }, // a real WXR import can take a while (media downloads); Prisma's default 5s/10s is nowhere near enough
  );

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
