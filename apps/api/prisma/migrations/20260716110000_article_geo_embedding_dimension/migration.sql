-- article_geo.contentEmbedding was declared as an unconstrained `vector`
-- (no dimension) since the init migration - pgvector allows storing into
-- an unconstrained vector column, but neither ivfflat nor hnsw indexes can
-- be built on one (both require a fixed dimension at index-creation time),
-- so semantic search could never be more than a full table scan.
--
-- 1536 matches what OpenAIProvider.embed() now requests via the `dimensions`
-- parameter on text-embedding-3-large/-small - both support truncating to
-- 1536 while remaining well-performing embeddings (OpenAI's own published
-- benchmarks show 1536 from text-embedding-3-large still beats the older
-- ada-002 at its native 1536), and 1536 stays safely under pgvector's
-- ~2000-dimension cap on indexed columns.
ALTER TABLE "article_geo" ALTER COLUMN "contentEmbedding" TYPE vector(1536);

-- HNSW over ivfflat: no separate "training" step needed (ivfflat's list
-- count has to be tuned against an already-populated table, awkward for a
-- column that starts empty and fills in gradually as articles publish),
-- and better recall/latency for this table's expected size. Cosine
-- distance matches OpenAI's own recommended similarity metric for their
-- embeddings.
CREATE INDEX article_geo_content_embedding_hnsw_idx
  ON "article_geo"
  USING hnsw ("contentEmbedding" vector_cosine_ops);
