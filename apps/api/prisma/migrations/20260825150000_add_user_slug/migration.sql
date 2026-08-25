-- AlterTable
ALTER TABLE "users" ADD COLUMN "slug" VARCHAR(220);

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_slug_key" ON "users"("organizationId", "slug");
