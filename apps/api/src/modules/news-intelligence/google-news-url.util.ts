// Google News RSS `<link>` values are a redirect wrapper
// (news.google.com/rss/articles/...), never the publisher's own URL - and
// unlike most feeds, that wrapper can't be resolved to the real article URL
// server-side (it's a JS-driven redirect, not a plain HTTP one; see
// ArticleExtractionService). Showing it as "source" would just be
// confusing, so callers that surface a source URL to readers should
// suppress it rather than publish a Google-internal link.
export function isGoogleNewsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('news.google.com');
}
