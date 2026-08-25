# rusdimedia.com deployment

rusdimedia.com is a WordPress site (permalinks `/%postname%/`) being
migrated onto this CMS **without changing its existing URL structure**. Full
background and the phased plan this belongs to: see the migration plan
saved at `C:\Users\Administrator\.claude\plans\elegant-launching-noodle.md`
(Fase 2). Short version: rusdimedia.com becomes its own `Organization` row,
served by its own deployment (own server, own database) — this repo's
architecture is single-tenant-per-deployment today (`PUBLIC_SITE_ORG_ID`),
so it is **not** a second site hosted from the same beritabot.com server.

This folder holds the two files that deployment needs, pre-filled for
rusdimedia.com, so provisioning it later is "copy two files and follow
`docs/DEPLOY.md`" rather than re-deriving every value from scratch:

- **`.env.production.example`** — `docs/DEPLOY.md` §5's env checklist,
  filled in for `rusdimedia.com` (domains, `ENABLE_CATEGORY_SUBDOMAINS=
  false`, and — the actual reason this is a separate config from
  beritabot.com — `FLAT_ARTICLE_URLS=true`, which is what makes articles
  live at the bare `/{slug}` WordPress used instead of this app's default
  `/news/{slug}`).
- **`Caddyfile`** — the reverse-proxy config for `rusdimedia.com`'s
  hostnames, simplified from beritabot.com's (no wildcard/DNS-01 setup,
  since rusdimedia.com doesn't use category subdomains).

Neither of these is wired into `docker-compose.prod.yml` or
`infrastructure/caddy/Caddyfile` — those two files remain beritabot.com's
actual live production config and must not be edited for rusdimedia.com.

## When the server is ready

1. Provision a new server and point DNS at it — `docs/DEPLOY.md` §1-§2,
   using `rusdimedia.com` / `app.rusdimedia.com` / `api.rusdimedia.com` /
   `media.rusdimedia.com` in place of `example.com`. No wildcard record
   needed (`ENABLE_CATEGORY_SUBDOMAINS` stays `false`).
2. Clone this repo onto **that** server, separately from wherever
   beritabot.com is deployed — `docs/DEPLOY.md` §3-§4.
3. Copy this folder's `.env.production.example` to `.env.production` at
   that clone's repo root, and fill in every placeholder (real secrets,
   real passwords) — `docs/DEPLOY.md` §5, plus §5.1 for the Postgres role
   passwords in `infrastructure/postgres/init.sql`.
4. Copy this folder's `Caddyfile` over that clone's
   `infrastructure/caddy/Caddyfile` (replacing the beritabot.com one *in
   that clone only* — never in the beritabot.com clone).
5. Build and bring up the stack — `docs/DEPLOY.md` §6-§7. Since
   `ENABLE_CATEGORY_SUBDOMAINS=false`, the stock `caddy:2-alpine` image is
   fine; §7.1's custom DNS-01 Caddy image isn't needed.
6. Bootstrap the real organization and admin account:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production \
     run --rm api-migrate sh -c "cd apps/api && \
       ORG_NAME='Rusdi Media' ORG_SLUG='rusdimedia' \
       ADMIN_EMAIL='<real admin email>' ADMIN_PASSWORD='<real password>' \
       ADMIN_FIRST_NAME='<first name>' ADMIN_LAST_NAME='<last name>' \
       npx ts-node -r tsconfig-paths/register scripts/bootstrap-org.ts"
   ```

   This is `apps/api/scripts/bootstrap-org.ts` — a parameterized version of
   `prisma/seed.ts` that creates a real, named organization instead of
   "Demo Organization" (`prisma/seed.ts` itself is left as the fixed local-
   dev fixture; don't repurpose it for this). It prints the new
   organization's id — copy that into `PUBLIC_SITE_ORG_ID` in
   `.env.production`, then `docker compose ... restart api` to pick it up
   (`docs/DEPLOY.md` §9 steps 3-4).
7. Verify — `docs/DEPLOY.md` §8.

## Not yet done (later phases of the migration)

- No WordPress content has been imported yet (Fase 3 — needs a WXR export
  from rusdimedia.com's WP Admin → Tools → Export first).
- No redirects have been bulk-loaded for URLs that changed/were removed on
  the old site (Fase 4).
