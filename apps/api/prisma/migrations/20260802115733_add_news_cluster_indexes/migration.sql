-- Indexes for the autonomous-publishing eligibility query
-- (AutonomousPublishingSchedulerService), which was doing a full sequential
-- scan of news_clusters plus a per-row anti-join scan of news_items on
-- every 10-minute cycle - the transaction was reliably exceeding Prisma's
-- interactive-transaction timeout in production as both tables grew.
--
-- Note: this migration intentionally omits the "DROP INDEX
-- article_geo_content_embedding_hnsw_idx" that `prisma migrate dev` wanted
-- to generate here - that pgvector HNSW index was added via raw SQL in
-- 20260716110000_article_geo_embedding_dimension and isn't representable
-- in schema.prisma, so Prisma's diff sees it as drift. It must stay.

-- CreateIndex
CREATE INDEX "news_clusters_organizationId_lastUpdatedAt_idx" ON "news_clusters"("organizationId", "lastUpdatedAt");

-- CreateIndex
CREATE INDEX "news_clusters_firstSeenAt_idx" ON "news_clusters"("firstSeenAt");

-- CreateIndex
CREATE INDEX "news_clusters_trendScore_idx" ON "news_clusters"("trendScore");

-- CreateIndex
CREATE INDEX "news_items_clusterId_articleId_idx" ON "news_items"("clusterId", "articleId");
