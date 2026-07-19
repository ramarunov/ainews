// Shared Cache-Control value for the public reader site's mostly-static
// read endpoints (article list/by-slug, categories, settings, author
// profiles) - lets a CDN/edge cache absorb a traffic spike (e.g. a viral
// article) instead of every request hitting NestJS + Postgres directly.
// 60s matches the frontend's own `next: { revalidate: 60 }` on the same
// data, so the two caching layers stay in sync; stale-while-revalidate
// lets a cache keep serving the last-good response while refreshing in
// the background rather than blocking on a slow origin.
export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';
