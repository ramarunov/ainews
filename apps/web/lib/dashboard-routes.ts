// The admin dashboard and the public reader site share this one Next.js
// app/domain (route groups like `(dashboard)`/`(public)` don't add a URL
// segment). This is every single-segment path the dashboard owns - used by:
//
// - app/robots.ts, to keep these out of search engines (belt-and-suspenders;
//   auth guards already keep them inaccessible without a session, so this
//   isn't a security boundary in itself)
// - proxy.ts's isPublicPath(), so a request for e.g. `rusdimedia.com/login`
//   still bounces to the dashboard host's real login page instead of being
//   treated as a candidate flat article/page slug - Next's router always
//   matches a static route (like `(dashboard)/login/page.tsx`) over the
//   public site's `[slug]/page.tsx` dynamic catch-all for the exact same
//   path, so without this exclusion `[slug]/page.tsx` would never even be
//   reached for these names, silently breaking two different things at
//   once: the real dashboard page AND any article that happened to want
//   one of these slugs.
//
// Mirrored (manually - see apps/web/lib/site-url.ts's header comment on
// why there's no shared package) into apps/api/src/modules/articles/
// articles.service.ts's RESERVED_FLAT_SLUGS, so an editor can't create an
// article with one of these slugs and have it silently become unreachable.
export const DASHBOARD_PATHS = [
  "/login", "/register", "/forgot-password", "/reset-password", "/oauth-callback",
  "/articles", "/categories", "/pages", "/tags", "/series", "/media", "/article-search",
  "/workflow", "/calendar", "/news-intelligence", "/analytics", "/redirects",
  "/users", "/api-keys", "/activity", "/system-settings", "/account",
];
