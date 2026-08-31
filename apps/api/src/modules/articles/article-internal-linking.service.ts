import { Injectable, Logger } from '@nestjs/common';
import { ArticleStatus } from '@prisma/client';
import { JSDOM } from 'jsdom';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { sanitizeArticleHtml } from '../../common/sanitize-html';
import { AIWriterService } from '../ai/ai-writer.service';

const MAX_CANDIDATES = 10;
const MIN_CANDIDATES = 3;
const MAX_LINKS_PER_ARTICLE = 3;
const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT — avoids depending on jsdom's window global for one constant.

// Inline "Baca juga:" related-article callouts (detik.com-style), a
// separate mechanism from the contextual in-text linking above: these are
// standalone <p> blocks dropped between paragraphs, not links wrapped
// around phrases already in the prose.
const MAX_READ_ALSO = 3;
const READ_ALSO_PREFIX: Record<string, string> = { id: 'Baca juga:', en: 'Read also:' };
const READ_ALSO_MARKER: Record<string, RegExp> = {
  id: /baca juga:/i,
  en: /read also:/i,
};

// The English edition lives at /en/{slug}; every other language uses the
// flat /{slug} permalink. Keep in sync with apps/web lib/i18n.ts.
function articleHref(slug: string, language: string): string {
  return language === 'en' ? `/en/${slug}` : `/${slug}`;
}

/**
 * Fully-automatic internal linking (no human review step, per explicit
 * product decision): the AI only ever proposes {searchText, targetSlug}
 * pairs copied verbatim from the content; this service is what actually
 * touches the HTML, and only after re-verifying the match itself. A
 * hallucinated searchText that doesn't literally occur in the content is
 * silently skipped rather than trusted.
 */
@Injectable()
export class ArticleInternalLinkingService {
  private readonly logger = new Logger(ArticleInternalLinkingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiWriter: AIWriterService,
  ) {}

  async insertLinks(articleId: string, organizationId: string): Promise<void> {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId },
      select: {
        id: true,
        content: true,
        language: true,
        primaryCategoryId: true,
        articleTags: { select: { tagId: true } },
      },
    });
    if (!article) return;

    const tagIds = article.articleTags.map((t) => t.tagId);
    if (!article.primaryCategoryId && tagIds.length === 0) return;

    const candidates = await this.prisma.article.findMany({
      where: {
        organizationId,
        status: ArticleStatus.PUBLISHED,
        deletedAt: null,
        id: { not: articleId },
        // Only link within the same edition - an English article must not
        // link out to an Indonesian one (different URL space, and a reader
        // on /en/ following it lands on a language they weren't reading).
        language: article.language,
        OR: [
          ...(article.primaryCategoryId ? [{ primaryCategoryId: article.primaryCategoryId }] : []),
          ...(tagIds.length > 0 ? [{ articleTags: { some: { tagId: { in: tagIds } } } }] : []),
        ],
      },
      select: { slug: true, title: true },
      take: MAX_CANDIDATES,
    });
    if (candidates.length < MIN_CANDIDATES) return;

    const dom = new JSDOM(`<body>${article.content}</body>`);
    const { document } = dom.window;
    const plainText = document.body.textContent || '';

    const suggestions = await this.aiWriter.suggestInternalLinks(plainText, candidates, organizationId, articleId);

    const validSlugs = new Set(candidates.map((c) => c.slug));
    const usedSlugs = new Set<string>();
    const usedSearchTexts = new Set<string>();
    let inserted = 0;

    for (const suggestion of suggestions) {
      if (inserted >= MAX_LINKS_PER_ARTICLE) break;
      if (!suggestion.searchText || suggestion.searchText.trim().length < 2) continue;
      if (!validSlugs.has(suggestion.targetSlug)) continue;
      if (usedSlugs.has(suggestion.targetSlug) || usedSearchTexts.has(suggestion.searchText)) continue;

      const textNode = this.findMatchableTextNode(document, suggestion.searchText);
      if (!textNode) continue;

      this.wrapTextNodeInLink(
        document,
        textNode,
        suggestion.searchText,
        suggestion.targetSlug,
        article.language,
      );
      usedSlugs.add(suggestion.targetSlug);
      usedSearchTexts.add(suggestion.searchText);
      inserted++;
    }

    if (inserted === 0) return;

    const newContent = sanitizeArticleHtml(document.body.innerHTML);
    await this.prisma.article.update({ where: { id: articleId }, data: { content: newContent } });
    this.logger.log(`Inserted ${inserted} internal link(s) into article ${articleId}`);
  }

  /**
   * Drops up to 3 inline "Baca juga: <headline>" callouts between the
   * paragraphs of a freshly-published article, linking recent articles in
   * the same category / sharing tags. Runs once, on first publish, right
   * after insertLinks(). Skips silently when the body has too few
   * paragraphs to space them out, when there are no related articles, or
   * when the content already carries a "Baca juga:" block (a re-publish).
   */
  async insertReadAlso(articleId: string, organizationId: string): Promise<void> {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId },
      select: {
        id: true,
        content: true,
        language: true,
        primaryCategoryId: true,
        articleTags: { select: { tagId: true } },
      },
    });
    if (!article?.content) return;
    const lang = article.language === 'en' ? 'en' : 'id';
    if ((READ_ALSO_MARKER[lang] ?? READ_ALSO_MARKER.id).test(article.content)) return;

    const tagIds = article.articleTags.map((t) => t.tagId);
    if (!article.primaryCategoryId && tagIds.length === 0) return;

    const candidates = await this.prisma.article.findMany({
      where: {
        organizationId,
        status: ArticleStatus.PUBLISHED,
        deletedAt: null,
        id: { not: articleId },
        // Same-edition only - see insertLinks().
        language: article.language,
        OR: [
          ...(article.primaryCategoryId ? [{ primaryCategoryId: article.primaryCategoryId }] : []),
          ...(tagIds.length > 0 ? [{ articleTags: { some: { tagId: { in: tagIds } } } }] : []),
        ],
      },
      select: { slug: true, title: true },
      orderBy: { publishedAt: 'desc' },
      take: MAX_READ_ALSO,
    });
    if (candidates.length === 0) return;

    const dom = new JSDOM(`<body>${article.content}</body>`);
    const { document } = dom.window;
    const paragraphs = Array.from(document.body.children).filter(
      (el) => el.tagName.toLowerCase() === 'p',
    );
    if (paragraphs.length < 2) return;

    // At most one callout per ~two paragraphs, so a short article doesn't
    // end up more "Baca juga" than prose.
    const count = Math.min(candidates.length, MAX_READ_ALSO, Math.floor(paragraphs.length / 2));
    if (count === 0) return;

    const used = new Set<number>();
    let inserted = 0;
    for (let i = 1; i <= count; i++) {
      // Spread evenly; never after the first or the last paragraph.
      let idx = Math.min(
        Math.max(1, Math.floor((paragraphs.length * i) / (count + 1))),
        paragraphs.length - 2,
      );
      while (used.has(idx) && idx < paragraphs.length - 2) idx++;
      if (used.has(idx)) continue;
      used.add(idx);

      const candidate = candidates[i - 1];
      const p = document.createElement('p');
      p.textContent = `${READ_ALSO_PREFIX[lang] ?? READ_ALSO_PREFIX.id} `;
      const anchor = document.createElement('a');
      anchor.setAttribute('href', articleHref(candidate.slug, lang));
      anchor.textContent = candidate.title;
      p.appendChild(anchor);
      paragraphs[idx].after(p);
      inserted++;
    }
    if (inserted === 0) return;

    const newContent = sanitizeArticleHtml(document.body.innerHTML);
    await this.prisma.article.update({ where: { id: articleId }, data: { content: newContent } });
    this.logger.log(`Inserted ${inserted} "Baca juga" block(s) into article ${articleId}`);
  }

  private findMatchableTextNode(document: Document, searchText: string): Text | null {
    const walker = document.createTreeWalker(document.body, SHOW_TEXT);
    let node: Node | null;
    // eslint-disable-next-line no-cond-assign
    while ((node = walker.nextNode())) {
      const textNode = node as unknown as Text;
      if (!textNode.textContent?.includes(searchText)) continue;
      if (this.isInsideExcludedAncestor(textNode)) continue;
      return textNode;
    }
    return null;
  }

  private isInsideExcludedAncestor(node: Node): boolean {
    let el = node.parentElement;
    while (el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' || /^h[1-6]$/.test(tag)) return true;
      el = el.parentElement;
    }
    return false;
  }

  private wrapTextNodeInLink(
    document: Document,
    textNode: Text,
    searchText: string,
    targetSlug: string,
    language: string,
  ): void {
    const fullText = textNode.textContent || '';
    const index = fullText.indexOf(searchText);
    if (index === -1) return;

    const before = fullText.slice(0, index);
    const after = fullText.slice(index + searchText.length);

    const anchor = document.createElement('a');
    // ID articles live at a bare `/{slug}`, the English edition at
    // `/en/{slug}` (see common/url/site-url.util.ts + apps/web lib/i18n.ts).
    anchor.setAttribute('href', articleHref(targetSlug, language));
    anchor.textContent = searchText;

    const parent = textNode.parentNode;
    if (!parent) return;

    if (before) parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(anchor, textNode);
    if (after) parent.insertBefore(document.createTextNode(after), textNode);
    parent.removeChild(textNode);
  }
}
