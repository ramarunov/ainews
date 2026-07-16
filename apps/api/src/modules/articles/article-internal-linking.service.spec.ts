/**
 * @jest-environment jsdom
 *
 * Needs jsdom (isomorphic-dompurify via sanitize-html) plus the real jsdom
 * package + openai/anthropic/google SDK load-time stubs — see
 * articles.service.spec.ts for the full explanation of each polyfill.
 */
import { TextEncoder, TextDecoder } from 'node:util';

(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

jest.mock('openai');
jest.mock('@anthropic-ai/sdk');
jest.mock('@google/generative-ai');
for (const name of ['fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'ReadableStream']) {
  (global as any)[name] = (global as any)[name] || class {};
}

import { ArticleInternalLinkingService } from './article-internal-linking.service';

describe('ArticleInternalLinkingService', () => {
  let service: ArticleInternalLinkingService;
  let prisma: any;
  let aiWriter: any;

  const baseArticle = {
    id: 'article-1',
    content: '<p>Scientists announced a breakthrough in fusion energy research today.</p>',
    primaryCategoryId: 'cat-1',
    articleTags: [{ tagId: 'tag-1' }],
  };

  const candidates = [
    { slug: 'fusion-basics', title: 'Fusion Basics' },
    { slug: 'energy-policy', title: 'Energy Policy' },
    { slug: 'climate-news', title: 'Climate News' },
  ];

  beforeEach(() => {
    prisma = {
      article: {
        findFirst: jest.fn().mockResolvedValue(baseArticle),
        findMany: jest.fn().mockResolvedValue(candidates),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    aiWriter = { suggestInternalLinks: jest.fn().mockResolvedValue([]) };
    service = new ArticleInternalLinkingService(prisma, aiWriter);
  });

  it('is a no-op when there are fewer than the minimum candidate count', async () => {
    prisma.article.findMany.mockResolvedValue(candidates.slice(0, 2));

    await service.insertLinks('article-1', 'org-1');

    expect(aiWriter.suggestInternalLinks).not.toHaveBeenCalled();
    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('is a no-op when the article has neither a category nor tags', async () => {
    prisma.article.findFirst.mockResolvedValue({ ...baseArticle, primaryCategoryId: null, articleTags: [] });

    await service.insertLinks('article-1', 'org-1');

    expect(prisma.article.findMany).not.toHaveBeenCalled();
    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('skips a hallucinated searchText that does not literally occur in the content', async () => {
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'this phrase was never in the article', targetSlug: 'fusion-basics' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('skips a suggestion whose targetSlug is not among the real candidates', async () => {
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'fusion energy research', targetSlug: 'not-a-real-candidate' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('inserts a verbatim match as a real anchor pointing at /news/<slug>', async () => {
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'fusion energy research', targetSlug: 'fusion-basics' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    expect(prisma.article.update).toHaveBeenCalledWith({
      where: { id: 'article-1' },
      data: { content: expect.stringContaining('<a href="/news/fusion-basics">fusion energy research</a>') },
    });
  });

  it('skips text that already sits inside an existing <a> tag', async () => {
    prisma.article.findFirst.mockResolvedValue({
      ...baseArticle,
      content: '<p><a href="/news/existing">fusion energy research</a> was announced today.</p>',
    });
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'fusion energy research', targetSlug: 'fusion-basics' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('skips text that sits inside a heading', async () => {
    prisma.article.findFirst.mockResolvedValue({
      ...baseArticle,
      content: '<h2>Fusion energy research breakthrough</h2><p>More details follow.</p>',
    });
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'Fusion energy research', targetSlug: 'fusion-basics' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    expect(prisma.article.update).not.toHaveBeenCalled();
  });

  it('caps insertions at 3 even when the AI proposes more', async () => {
    prisma.article.findFirst.mockResolvedValue({
      ...baseArticle,
      content:
        '<p>Alpha topic discussion. Beta topic discussion. Gamma topic discussion. Delta topic discussion.</p>',
    });
    prisma.article.findMany.mockResolvedValue([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
      { slug: 'gamma', title: 'Gamma' },
      { slug: 'delta', title: 'Delta' },
    ]);
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'Alpha topic', targetSlug: 'alpha' },
      { searchText: 'Beta topic', targetSlug: 'beta' },
      { searchText: 'Gamma topic', targetSlug: 'gamma' },
      { searchText: 'Delta topic', targetSlug: 'delta' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    const savedContent = prisma.article.update.mock.calls[0][0].data.content;
    const anchorCount = (savedContent.match(/<a /g) || []).length;
    expect(anchorCount).toBe(3);
    expect(savedContent).not.toContain('Delta topic</a>');
  });

  it('never targets the same slug twice even if the AI proposes it twice', async () => {
    prisma.article.findFirst.mockResolvedValue({
      ...baseArticle,
      content: '<p>Fusion energy research is booming. Fusion energy research keeps growing.</p>',
    });
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'Fusion energy research is booming', targetSlug: 'fusion-basics' },
      { searchText: 'Fusion energy research keeps growing', targetSlug: 'fusion-basics' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    const savedContent = prisma.article.update.mock.calls[0][0].data.content;
    const anchorCount = (savedContent.match(/<a /g) || []).length;
    expect(anchorCount).toBe(1);
  });

  it('re-sanitizes the final content, stripping anything outside the allowlist', async () => {
    prisma.article.findFirst.mockResolvedValue({
      ...baseArticle,
      content: '<p>Fusion energy research <script>alert(1)</script>continues.</p>',
    });
    aiWriter.suggestInternalLinks.mockResolvedValue([
      { searchText: 'Fusion energy research', targetSlug: 'fusion-basics' },
    ]);

    await service.insertLinks('article-1', 'org-1');

    const savedContent = prisma.article.update.mock.calls[0][0].data.content;
    expect(savedContent).not.toContain('<script>');
  });
});
