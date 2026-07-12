-- Remove RLS from audit_logs, added in 20260712120000_row_level_security.
--
-- Two reasons this table doesn't fit the same tenant_isolation policy as
-- the others:
--   1. "organizationId" is nullable here (legitimate org-less system
--      events) — the policy's WITH CHECK would reject inserting ANY row
--      with a NULL organizationId regardless of context, since NULL never
--      equals the session GUC.
--   2. AuditLogService.record() is called from a global interceptor that
--      fires on every mutating request, including public, pre-auth ones
--      like registration — where the audit entry's organizationId (the
--      org just created by that same request) isn't known until deep
--      inside the request, well after any request-level org context would
--      normally be established.
--
-- Audit log reads already go through an explicit
-- `where: { organizationId }` filter at the app level
-- (GET /audit-logs in audit.controller.ts), so tenant isolation for reads
-- doesn't regress — this migration only removes the extra DB-level layer
-- for this one table.

ALTER TABLE "audit_logs" NO FORCE ROW LEVEL SECURITY;
DROP POLICY tenant_isolation ON "audit_logs";
ALTER TABLE "audit_logs" DISABLE ROW LEVEL SECURITY;
