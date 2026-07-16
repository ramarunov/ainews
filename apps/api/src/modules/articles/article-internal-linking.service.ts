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

      this.wrapTextNodeInLink(document, textNode, suggestion.searchText, suggestion.targetSlug);
      usedSlugs.add(suggestion.targetSlug);
      usedSearchTexts.add(suggestion.searchText);
      inserted++;
    }

    if (inserted === 0) return;

    const newContent = sanitizeArticleHtml(document.body.innerHTML);
    await this.prisma.article.update({ where: { id: articleId }, data: { content: newContent } });
    this.logger.log(`Inserted ${inserted} internal link(s) into article ${articleId}`);
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

  private wrapTextNodeInLink(document: Document, textNode: Text, searchText: string, targetSlug: string): void {
    const fullText = textNode.textContent || '';
    const index = fullText.indexOf(searchText);
    if (index === -1) return;

    const before = fullText.slice(0, index);
    const after = fullText.slice(index + searchText.length);

    const anchor = document.createElement('a');
    anchor.setAttribute('href', `/news/${targetSlug}`);
    anchor.textContent = searchText;

    const parent = textNode.parentNode;
    if (!parent) return;

    if (before) parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(anchor, textNode);
    if (after) parent.insertBefore(document.createTextNode(after), textNode);
    parent.removeChild(textNode);
  }
}
