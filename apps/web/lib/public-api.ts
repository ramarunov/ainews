import type { PaginatedResponse, PublicArticle } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Plain server-side fetches for the public reader site — no auth, no
// TanStack Query, no client-side auth-store. These run inside Server
// Components at request/build time, not in the browser.

export async function getPublishedArticles(
  page = 1,
): Promise<PaginatedResponse<PublicArticle>> {
  const res = await fetch(`${API_URL}/public/articles?page=${page}&limit=20`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
  }
  return res.json();
}

export async function getPublishedArticleBySlug(
  slug: string,
): Promise<PublicArticle | null> {
  const res = await fetch(`${API_URL}/public/articles/${slug}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}
