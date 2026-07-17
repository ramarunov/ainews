-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SPAM');

-- CreateTable
CREATE TABLE "article_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "parentId" UUID,
    "authorName" VARCHAR(100) NOT NULL,
    "authorEmail" VARCHAR(255) NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "spamScore" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "article_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_comments_organizationId_idx" ON "article_comments"("organizationId");

-- CreateIndex
CREATE INDEX "article_comments_articleId_status_idx" ON "article_comments"("articleId", "status");

-- CreateIndex
CREATE INDEX "article_comments_parentId_idx" ON "article_comments"("parentId");

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "article_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: same tenant_isolation policy as every other org-scoped
-- table (see migrations/20260712120000_row_level_security) - a brand new
-- table gets it applied immediately rather than as a retroactive follow-up.
-- Public comment submission (@PublicSiteRead(), no authenticated user) runs
-- under the PUBLIC_SITE_ORG_ID context same as every other public-site
-- write/read, which the rls-tenant-isolation Prisma extension turns into a
-- per-operation `SET LOCAL app.current_org_id` transaction automatically -
-- no special-casing needed here beyond what already exists.
ALTER TABLE "article_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "article_comments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "article_comments"
  USING ("organizationId" = current_setting('app.current_org_id', true)::uuid);
