-- PostgreSQL initialization script
-- Runs once when the database container is first created

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- trigram similarity (fuzzy search)
CREATE EXTENSION IF NOT EXISTS "btree_gin";       -- GIN indexes for composite queries
CREATE EXTENSION IF NOT EXISTS "unaccent";        -- accent-insensitive search

-- Create a read replica user (for analytics queries)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ainews_readonly') THEN
        CREATE ROLE ainews_readonly WITH LOGIN PASSWORD 'readonly_password';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE ainews_db TO ainews_readonly;
GRANT USAGE ON SCHEMA public TO ainews_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ainews_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ainews_readonly;

-- Performance settings (applied after container start via postgresql.conf)
-- These are documented here as reference; apply via ConfigMap in production

-- shared_buffers = 256MB
-- effective_cache_size = 1GB
-- work_mem = 16MB
-- maintenance_work_mem = 128MB
-- wal_level = replica
-- max_wal_senders = 3
-- archive_mode = on
-- log_min_duration_statement = 1000  -- log slow queries > 1 second
