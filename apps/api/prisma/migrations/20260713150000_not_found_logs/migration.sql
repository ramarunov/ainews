-- CreateTable
CREATE TABLE "not_found_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "path" VARCHAR(1000) NOT NULL,
    "referrer" VARCHAR(1000),
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "not_found_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "not_found_logs_organizationId_resolved_lastSeenAt_idx" ON "not_found_logs"("organizationId", "resolved", "lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "not_found_logs_organizationId_path_key" ON "not_found_logs"("organizationId", "path");

-- AddForeignKey
ALTER TABLE "not_found_logs" ADD CONSTRAINT "not_found_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security: same tenant-isolation pattern as the other
-- organizationId-scoped tables (see migrations/20260712120000_row_level_security
-- and its NULLIF fix). "redirects" already got this in that original
-- migration — only "not_found_logs" is new here. Both are read/written
-- only after a request's org context is known (the public-site resolve
-- endpoint uses PUBLIC_SITE_ORG_ID same as the article read endpoints),
-- so neither has the auth-timing problem that excluded "users"/"roles".
ALTER TABLE "not_found_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "not_found_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "not_found_logs"
  USING ("organizationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
