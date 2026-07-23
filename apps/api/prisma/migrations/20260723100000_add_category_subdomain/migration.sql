-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "subdomain" VARCHAR(63);

-- CreateIndex
-- Postgres treats each NULL as distinct for a unique index, so categories
-- without a subdomain assigned yet (the default/existing state) are
-- unaffected - only a real, non-null collision within the same org is
-- rejected.
CREATE UNIQUE INDEX "categories_organizationId_subdomain_key" ON "categories"("organizationId", "subdomain");
