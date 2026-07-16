-- Remove RLS from api_keys, added in 20260712120000_row_level_security.
--
-- Same reasoning as the users/roles exclusion in that migration, and the
-- refresh_tokens/password_reset_tokens tables that never had RLS applied
-- at all: authenticating an incoming request via its API key must look
-- the key up by keyHash BEFORE the org context is known - that's the
-- entire point of the lookup, so a tenant_isolation policy comparing
-- against a not-yet-set app.current_org_id would fail closed and reject
-- every request, including legitimate ones.
--
-- CRUD on a user's own keys (create/list/revoke) always happens inside an
-- already-authenticated, org-scoped request, so those paths keep relying
-- on the app's existing explicit `where: { organizationId }` filters -
-- tenant isolation for those doesn't regress, only the extra DB-level
-- layer for the one pre-auth lookup path is removed.

ALTER TABLE "api_keys" NO FORCE ROW LEVEL SECURITY;
DROP POLICY tenant_isolation ON "api_keys";
ALTER TABLE "api_keys" DISABLE ROW LEVEL SECURITY;
