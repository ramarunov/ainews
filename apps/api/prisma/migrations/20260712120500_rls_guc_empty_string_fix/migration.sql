-- Fix for the tenant_isolation policies added in
-- 20260712120000_row_level_security: on a pooled/reused connection, once
-- `SET LOCAL app.current_org_id = '...'` has been used at least once in a
-- session, current_setting('app.current_org_id', true) reverts to an EMPTY
-- STRING (not SQL NULL) once that transaction commits — a Postgres quirk
-- specific to custom (non-preconfigured) GUC placeholder variables.
-- Casting '' to uuid raises "invalid input syntax for type uuid", which
-- previously broke every later query on that same connection that didn't
-- itself set the GUC (e.g. a request from a different org, or no org
-- context at all) — confirmed by direct psql testing against the live DB,
-- not a hypothetical. NULLIF(..., '') normalizes both "never set" (NULL)
-- and "set then reset by commit" ('') to NULL before the cast, so the
-- policy fails closed (denies all rows) instead of erroring.

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
    EXECUTE format('DROP POLICY tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organizationId" = NULLIF(current_setting(''app.current_org_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END
$$;
