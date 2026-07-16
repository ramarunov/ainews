import type {
  Category,
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
    return await res.json();
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug) ?? null;
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
