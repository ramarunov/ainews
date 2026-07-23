import type {
  Category,
  CommentNode,
  Page,
  PaginatedResponse,
  PublicArticle,
  PublicAuthor,
  PublicSearchResult,
  PublicSetting,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const emptyPage = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

// Plain server-side fetches for the public reader site — no auth, no
// TanStack Query, no client-side auth-store. These run inside Server
// Components at request/build time, not in the browser. Every function
// swallows fetch failures rather than throwing — the API being unreachable
// (e.g. not yet deployed, or this is a frontend-only build) must not fail
// static generation of pages that call these, like /sitemap.xml.

export interface ArticleFilters {
  page?: number;
  limit?: number;
  categorySlug?: string;
  authorId?: string;
  isBreaking?: boolean;
  isFeatured?: boolean;
  search?: string;
  excludeId?: string;
  sortBy?: "publishedAt" | "viewCount";
}

export async function getPublishedArticles(
  filters: ArticleFilters = {},
): Promise<PaginatedResponse<PublicArticle>> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));
  if (filters.categorySlug) params.set("categorySlug", filters.categorySlug);
  if (filters.authorId) params.set("authorId", filters.authorId);
  if (filters.isBreaking !== undefined) params.set("isBreaking", String(filters.isBreaking));
  if (filters.isFeatured !== undefined) params.set("isFeatured", String(filters.isFeatured));
  if (filters.search) params.set("search", filters.search);
  if (filters.excludeId) params.set("excludeId", filters.excludeId);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);

  try {
    const res = await fetch(`${API_URL}/public/articles?${params.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return emptyPage;
    return await res.json();
  } catch {
    return emptyPage;
  }
}

// The public API caps a single page at 100 (see PublicArticlesQueryDto's
// @Max(100)) - fine for every UI listing, which only ever shows a handful
// of items, but sitemap.ts/image-sitemap.xml need EVERY published article,
// not just the newest page. Pages through the public endpoint until it
// runs out or `cap` is hit, so a sitemap can never silently truncate to
// one page's worth again (see git history for the bug this replaced: both
// sitemaps used a bare getPublishedArticles() call, capped at 20/100
// articles forever, well past what young the site has today but a ceiling
// real growth would eventually hit). `cap` is a safety valve, not the
// expected steady state - Google's own single-sitemap-file limit is 50,000
// URLs; if this ever gets close, split into a sitemap index instead of
// raising it further.
export async function getAllPublishedArticles(
  filters: Omit<ArticleFilters, "page" | "limit"> = {},
  cap = 5000,
): Promise<PublicArticle[]> {
  const pageSize = 100;
  const all: PublicArticle[] = [];
  for (let page = 1; all.length < cap; page++) {
    const { data } = await getPublishedArticles({ ...filters, page, limit: pageSize });
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all.slice(0, cap);
}

export async function getPublishedArticleBySlug(
  slug: string,
): Promise<PublicArticle | null> {
  try {
    const res = await fetch(`${API_URL}/public/articles/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_URL}/public/categories`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const categories: Category[] = await res.json();
    // The API returns a flat list (both top-level categories and their
    // subcategories, all with parentId set where applicable) - `parent` is
    // resolved here, once, so every consumer (header, footer, mega panel,
    // getCategoryUrl) can just read category.parent?.subdomain without its
    // own lookup. See lib/types.ts's Category.parent doc comment.
    const byId = new Map(categories.map((c) => [c.id, c]));
    return categories.map((c) =>
      c.parentId ? { ...c, parent: byId.get(c.parentId) ?? null } : c,
    );
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return null;
  return {
    ...category,
    children: categories.filter((c) => c.parentId === category.id && c.isActive !== false),
  };
}

// Published static pages (About, Contact, Disclaimer, Privacy Policy, ...) -
// list is small and mostly for footer/nav links, so full objects (not just
// slug/title) are fine to fetch upfront the same way categories are.
export async function getPages(): Promise<Page[]> {
  try {
    const res = await fetch(`${API_URL}/public/pages`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getPageBySlug(slug: string): Promise<Page | null> {
  try {
    const res = await fetch(`${API_URL}/public/pages/${slug}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getAuthorProfile(id: string): Promise<PublicAuthor | null> {
  try {
    const res = await fetch(`${API_URL}/public/authors/${id}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchPublishedArticles(
  q: string,
  page = 1,
): Promise<PaginatedResponse<PublicSearchResult>> {
  if (!q.trim()) return emptyPage;
  try {
    const params = new URLSearchParams({ q, page: String(page), limit: "20" });
    const res = await fetch(`${API_URL}/public/search?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return emptyPage;
    return await res.json();
  } catch {
    return emptyPage;
  }
}

export async function getPublicSettings(): Promise<PublicSetting[]> {
  try {
    const res = await fetch(`${API_URL}/public/settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Shared lookup for the array getPublicSettings() returns - every caller
// wants one key's typed value, not the raw isPublic-flagged row list.
export function findPublicSetting<T>(settings: PublicSetting[], key: string): T | undefined {
  return settings.find((s) => s.key === key)?.value as T | undefined;
}

export async function getArticleComments(slug: string): Promise<CommentNode[]> {
  try {
    const res = await fetch(`${API_URL}/public/articles/${slug}/comments`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export interface SubmitCommentInput {
  authorName: string;
  authorEmail: string;
  content: string;
  parentId?: string;
}

// Unlike every other function in this file, a failure here needs to reach
// the comment form with a real message (e.g. "Comments may not contain
// links") rather than being swallowed to an empty default - so this
// returns a result object instead of throwing or silently degrading.
export async function submitArticleComment(
  slug: string,
  input: SubmitCommentInput,
): Promise<{ ok: true; status: string; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/public/articles/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
      return { ok: false, error: message ?? "Failed to submit comment." };
    }
    return { ok: true, status: body.status, message: body.message };
  } catch {
    return { ok: false, error: "Failed to submit comment. Please check your connection." };
  }
}

export async function resolveRedirect(
  path: string,
  referrer?: string,
): Promise<{ toUrl: string; statusCode: number } | null> {
  const params = new URLSearchParams({ path });
  if (referrer) params.set("referrer", referrer);

  try {
    const res = await fetch(`${API_URL}/public/resolve?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    // A miss returns an empty body (Nest sends no content for a `null`
    // JSON response), which res.json() can't parse.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
