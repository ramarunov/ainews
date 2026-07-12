-- Row-Level Security: tenant isolation as defense-in-depth.
--
-- Applied only to tables with a direct "organizationId" column that are
-- read/written AFTER a request's org context is established. Deliberately
-- EXCLUDED: "users" and "roles" — both are read inside the JWT auth
-- strategy's user lookup (which resolves permissions via a nested
-- `userRoles.role` include) before the per-request org context is set up,
-- and "users" specifically must remain queryable by email ACROSS
-- organizations for login to work at all. These two tables keep relying on
-- the app's existing explicit `where: { organizationId }` filters and
-- PermissionsGuard checks, same as before this migration.
--
-- The policy compares each row's "organizationId" against the Postgres
-- session variable app.current_org_id, set via `SET LOCAL` by the
-- application for the duration of a single transaction (see
-- src/infrastructure/prisma/org-context.ts and rls-extension.ts). When the
-- variable is unset (current_setting(..., true) returns NULL) — e.g. a
-- script or query that never established an org context — the comparison
-- evaluates to NULL/false and FORCE ROW LEVEL SECURITY denies all rows:
-- fail closed, not fail open.
--
-- IMPORTANT: FORCE ROW LEVEL SECURITY still does nothing if the connecting
-- role is a Postgres superuser or has BYPASSRLS (both unconditionally skip
-- every RLS policy). The app must connect at runtime as the non-superuser
-- `ainews_app` role created in infrastructure/postgres/init.sql — never as
-- the `ainews` superuser used for migrations.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'categories', 'tags', 'articles', 'media_files', 'news_sources',
    'news_items', 'news_clusters', 'workflows', 'redirects',
    'article_views', 'plugins', 'themes', 'webhooks', 'audit_logs',
    'settings', 'api_keys'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organizationId" = current_setting(''app.current_org_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END
$$;
