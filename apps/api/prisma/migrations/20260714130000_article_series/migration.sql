-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "seriesId" UUID,
ADD COLUMN     "seriesOrder" INTEGER;

-- CreateTable
CREATE TABLE "article_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "article_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_series_organizationId_idx" ON "article_series"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "article_series_organizationId_slug_key" ON "article_series"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "articles_seriesId_seriesOrder_idx" ON "articles"("seriesId", "seriesOrder");

-- AddForeignKey
ALTER TABLE "article_series" ADD CONSTRAINT "article_series_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "article_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: same tenant-isolation pattern as every other
-- organizationId-scoped table (see migrations/20260712120000_row_level_security
-- and its NULLIF fix).
ALTER TABLE "article_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "article_series" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "article_series"
  USING ("organizationId" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
