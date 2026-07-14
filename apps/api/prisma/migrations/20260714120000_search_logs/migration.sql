-- CreateTable
CREATE TABLE "search_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "query" VARCHAR(500) NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_logs_organizationId_createdAt_idx" ON "search_logs"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "search_logs_organizationId_query_idx" ON "search_logs"("organizationId", "query");

-- AddForeignKey
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security: same tenant-isolation pattern as every other
-- organizationId-scoped table (see migrations/20260712120000_row_level_security
-- and its NULLIF fix). Search is only ever performed inside an authenticated,
-- org-scoped request, so this table has no auth-timing problem.
ALTER TABLE "search_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "search_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "search_logs"
  USING ("organizationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
