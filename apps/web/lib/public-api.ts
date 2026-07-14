import type { PaginatedResponse, PublicArticle } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Plain server-side fetches for the public reader site — no auth, no
// TanStack Query, no client-side auth-store. These run inside Server
// Components at request/build time, not in the browser.

export async function getPublishedArticles(
  page = 1,
): Promise<PaginatedResponse<PublicArticle>> {
  const empty = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
  try {
    const res = await fetch(`${API_URL}/public/articles?page=${page}&limit=20`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return empty;
    return await res.json();
  } catch {
    // The API being unreachable (e.g. not yet deployed, or this is a
    // frontend-only build) must not fail static generation of pages that
    // call this, like /sitemap.xml.
    return empty;
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
