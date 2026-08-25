import * as cheerio from 'cheerio';

// Shared WordPress "WXR" export (Tools -> Export -> All content) parsing,
// used by both scripts/import-wordpress.ts and
// scripts/generate-redirect-suggestions.ts - kept in one place so the two
// never drift on what counts as a post/page/attachment or "real content".

export interface WpAuthor {
  login: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
}

export interface WpCategory {
  nicename: string;
  name: string;
  parentNicename: string | null;
}

export interface WpTag {
  slug: string;
  name: string;
}

export interface WpPost {
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

export function parseWxr(xml: string) {
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

// Page-builder plugins (Tagdiv Composer's `[tdc_zone]`/`[vc_row]`, WPPB's
// `[wppb-login]`, etc.) store their raw shortcode source in
// content:encoded, not rendered HTML - WXR export never runs the shortcode
// through WordPress's render pipeline. Confirmed live against
// rusdimedia.com's real export: every theme-generated utility "page"
// (login, checkout, account, menu templates, ...) came through as either
// empty or literal `[shortcode ...]` bracket soup, never real prose - if
// imported as-is it would publish as visibly broken bracket-text content.
// A genuine editorial post/page's content:encoded is real HTML
// (`<p>...`), so "empty or starts with a shortcode bracket" is a safe
// signal to skip on, not just a slug-based guess.
export function looksLikeUnrenderedContent(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return true;
  return /^\[\w/.test(trimmed);
}
