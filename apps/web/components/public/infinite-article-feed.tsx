"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArticleContent } from "./article-content";
import { getArticleComments, getPublishedArticleBySlug, getPublishedArticles } from "@/lib/public-api";
import { getArticleUrl } from "@/lib/site-url";
import type { CommentNode, PaginatedResponse, PublicArticle, PublicSetting } from "@/lib/types";

// Auto-loads the next article (same category as whatever was most recently
// loaded, falling back to sitewide-latest once that category runs out) as
// the reader scrolls near the bottom - more pages read per session means
// more ad impressions per session with zero extra traffic. Implemented per
// Google's own guidance for infinite scroll + AdSense: the URL is kept in
// sync via a plain history.pushState (not a Next.js route transition, which
// would replace this content instead of appending to it), and each newly
// appended article gets genuinely fresh <AdSlot> instances (via a stable
// per-article `key`) so ads are actually re-initialized per "virtual page",
// not just visually inserted HTML. Every article still has its own real,
// independently crawlable URL regardless of this - this is purely a client-
// side reading enhancement layered on top, not a replacement for normal
// navigation.
const MAX_AUTO_LOADED = 10;
const MAX_SKIP_ATTEMPTS = 20;

interface LoadedArticle {
  article: PublicArticle;
  related: PaginatedResponse<PublicArticle>;
  comments: CommentNode[];
  trending: PaginatedResponse<PublicArticle>;
}

const emptyPage: PaginatedResponse<PublicArticle> = {
  data: [],
  meta: { total: 0, page: 1, limit: 8, totalPages: 0 },
};

export function InfiniteArticleFeed({
  initialArticle,
  initialRelated,
  initialComments,
  initialTrending,
  settings,
}: {
  initialArticle: PublicArticle;
  initialRelated: PaginatedResponse<PublicArticle>;
  initialComments: CommentNode[];
  initialTrending: PaginatedResponse<PublicArticle>;
  settings: PublicSetting[];
}) {
  const [items, setItems] = useState<LoadedArticle[]>([
    { article: initialArticle, related: initialRelated, comments: initialComments, trending: initialTrending },
  ]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Refs, not state - these are bookkeeping for loadNext's own logic, not
  // values a re-render should ever depend on.
  const seenIdsRef = useRef(
    new Set([
      initialArticle.id,
      ...initialRelated.data.map((a) => a.id),
      ...initialTrending.data.map((a) => a.id),
    ]),
  );
  const categoryPageRef = useRef(1);
  const globalPageRef = useRef(1);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const loadNext = useCallback(async () => {
    if (loading || exhausted || itemsRef.current.length >= MAX_AUTO_LOADED) return;
    setLoading(true);
    try {
      const current = itemsRef.current[itemsRef.current.length - 1].article;
      let next: PublicArticle | null = null;

      if (current.primaryCategory) {
        for (let i = 0; i < MAX_SKIP_ATTEMPTS && !next; i++) {
          categoryPageRef.current += 1;
          const page = await getPublishedArticles({
            categorySlug: current.primaryCategory.slug,
            page: categoryPageRef.current,
            limit: 1,
            sortBy: "publishedAt",
          });
          if (page.data.length === 0) break; // category's pagination is exhausted
          if (!seenIdsRef.current.has(page.data[0].id)) next = page.data[0];
        }
      }

      if (!next) {
        // Fallback once the current category runs out (or the article had
        // no category at all): sitewide latest, same as the homepage.
        for (let i = 0; i < MAX_SKIP_ATTEMPTS && !next; i++) {
          globalPageRef.current += 1;
          const page = await getPublishedArticles({ page: globalPageRef.current, limit: 1 });
          if (page.data.length === 0) break;
          if (!seenIdsRef.current.has(page.data[0].id)) next = page.data[0];
        }
      }

      if (!next) {
        setExhausted(true);
        return;
      }

      // `next` came from the LIST endpoint (getPublishedArticles), which
      // deliberately omits the full body HTML for listing performance -
      // confirmed live that its `content` field is simply absent. Fetch
      // the single-article detail endpoint (same one the initial
      // server-rendered load uses) to get the real content before
      // rendering it - without this the appended article showed a fully
      // empty gap where the body should be.
      const nextArticle = await getPublishedArticleBySlug(next.slug);
      if (!nextArticle) {
        setExhausted(true);
        return;
      }
      seenIdsRef.current.add(nextArticle.id);

      const [related, comments, trending] = await Promise.all([
        nextArticle.primaryCategory
          ? getPublishedArticles({
              categorySlug: nextArticle.primaryCategory.slug,
              excludeId: nextArticle.id,
              limit: 8,
            })
          : Promise.resolve(emptyPage),
        getArticleComments(nextArticle.slug),
        getPublishedArticles({ sortBy: "viewCount", excludeId: nextArticle.id, limit: 5 }),
      ]);
      for (const a of related.data) seenIdsRef.current.add(a.id);

      setItems((prev) => [...prev, { article: nextArticle, related, comments, trending }]);

      // Plain history update, not router.push - this must NOT trigger a
      // Next.js navigation (which would replace the page's content instead
      // of the reader continuing to scroll through what's already loaded).
      window.history.pushState(null, "", getArticleUrl(nextArticle));
      document.title = nextArticle.title;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, exhausted]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // rootMargin starts the fetch well before the sentinel is actually
    // visible, so the next article is ready by the time the reader scrolls
    // to where it would have been - no visible loading gap.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNext();
      },
      { rootMargin: "800px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadNext]);

  const done = exhausted || items.length >= MAX_AUTO_LOADED;

  return (
    <>
      {items.map((item) => (
        <ArticleContent
          key={item.article.id}
          article={item.article}
          related={item.related}
          comments={item.comments}
          trending={item.trending}
          settings={settings}
        />
      ))}
      {!done && <div ref={sentinelRef} aria-hidden className="h-px" />}
      {done && (
        <div className="flex justify-center py-10">
          <Link href="/" className="rounded-md bg-primary px-6 py-2 font-bold text-primary-foreground">
            Kembali ke Beranda
          </Link>
        </div>
      )}
    </>
  );
}
