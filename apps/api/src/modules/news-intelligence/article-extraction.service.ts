import { Injectable, Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

import { sanitizeArticleHtml } from '../../common/sanitize-html';
import { assertPublicHttpUrl } from '../../common/ssrf-guard';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; AINewsCMS/1.0; +https://example.com/bot) ArticleExtractor';

export interface ExtractedArticle {
  content: string;
  excerpt: string | null;
  textContent: string;
  // The URL the fetch actually landed on after following redirects - for
  // aggregator feeds (Google News in particular) `url` passed in is a
  // redirect wrapper, never the publisher's real article URL. `fetch`
  // follows redirects by default, so `res.url` is the real destination.
  resolvedUrl: string;
}

@Injectable()
export class ArticleExtractionService {
  private readonly logger = new Logger(ArticleExtractionService.name);

  // RSS feeds frequently truncate description/content:encoded to a short
  // teaser (publishers do this deliberately to drive clicks to their own
  // site) — below this length we assume the feed content is a teaser and
  // it's worth trying to fetch+extract the full article instead.
  private static readonly TRUNCATION_THRESHOLD = 500;

  isLikelyTruncated(content: string | null | undefined): boolean {
    if (!content) return true;
    const trimmed = content.trim();
    if (trimmed.length < ArticleExtractionService.TRUNCATION_THRESHOLD) return true;
    return /[.…]{2,}\s*$/.test(trimmed) || trimmed.endsWith('…');
  }

  // Best-effort: fetches the original article page and runs Readability
  // (the algorithm behind Firefox Reader View) to pull the full article
  // body out of the surrounding page chrome. Returns null on any failure
  // so callers can fall back to the original RSS-provided snippet.
  async extractFromUrl(url: string): Promise<ExtractedArticle | null> {
    try {
      // This URL comes from an RSS feed (or an AI-resolved redirect) - an
      // org admin who can add a news source, or a compromised/malicious
      // feed, could otherwise steer this server-side fetch at an internal
      // address. Checked per call, not once at startup, since DNS can change.
      await assertPublicHttpUrl(url);
    } catch (err: any) {
      this.logger.warn(`Refusing to extract from ${url}: ${err?.message ?? err}`);
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!res.ok) {
        this.logger.warn(`Extraction fetch failed for ${url}: HTTP ${res.status}`);
        return null;
      }

      const html = await res.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const parsed = reader.parse();
      const textContent = parsed?.textContent ?? '';

      if (!parsed?.content || textContent.trim().length < 200) {
        return null;
      }

      return {
        content: sanitizeArticleHtml(parsed.content),
        excerpt: parsed.excerpt ?? null,
        textContent,
        resolvedUrl: res.url,
      };
    } catch (err: any) {
      this.logger.warn(`Extraction failed for ${url}: ${err?.message ?? err}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
