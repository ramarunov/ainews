/**
 * @jest-environment jsdom
 *
 * jsdom's test environment doesn't provide TextEncoder/TextDecoder, which
 * the jsdom *package* (used here for real, to build a DOM from fetched
 * HTML) needs at import time via whatwg-url. Must run before that import.
 */
import { TextEncoder, TextDecoder } from 'node:util';

(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

import { ArticleExtractionService } from './article-extraction.service';

describe('ArticleExtractionService', () => {
  let service: ArticleExtractionService;

  beforeEach(() => {
    service = new ArticleExtractionService();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isLikelyTruncated', () => {
    it('treats null/empty content as truncated', () => {
      expect(service.isLikelyTruncated(null)).toBe(true);
      expect(service.isLikelyTruncated('')).toBe(true);
    });

    it('treats short content as truncated', () => {
      expect(service.isLikelyTruncated('A short teaser.')).toBe(true);
    });

    it('treats content ending in an ellipsis as truncated regardless of length', () => {
      const long = 'x'.repeat(600) + '...';
      expect(service.isLikelyTruncated(long)).toBe(true);
    });

    it('treats sufficiently long, complete content as not truncated', () => {
      const long = 'This is a full sentence. '.repeat(30);
      expect(service.isLikelyTruncated(long)).toBe(false);
    });
  });

  describe('extractFromUrl', () => {
    const paragraph = 'This is a full paragraph of real article content. '.repeat(20);

    it('extracts and sanitizes the full article body from a real page', async () => {
      const html = `<!doctype html><html><head><title>Test Article</title></head>
        <body><article><h1>Test Article</h1><p>${paragraph}</p><script>alert(1)</script></article></body></html>`;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => html,
      });

      const result = await service.extractFromUrl('https://example.com/article');

      expect(result).not.toBeNull();
      expect(result!.content).toContain('full paragraph');
      expect(result!.content).not.toContain('<script>');
      expect(result!.textContent.length).toBeGreaterThan(200);
    });

    it('returns null when the fetch response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

      const result = await service.extractFromUrl('https://example.com/missing');

      expect(result).toBeNull();
    });

    it('returns null when fetch throws (network error/timeout)', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('network error'));

      const result = await service.extractFromUrl('https://example.com/unreachable');

      expect(result).toBeNull();
    });

    it('returns null when Readability finds nothing article-like', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => '<!doctype html><html><body><div>too short</div></body></html>',
      });

      const result = await service.extractFromUrl('https://example.com/empty');

      expect(result).toBeNull();
    });
  });
});
