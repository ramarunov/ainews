# Database Design Document (DDD)
## AI Native News CMS — Enterprise Edition
**Version:** 1.0.0  
**Date:** 2026-07-08  
**Database:** PostgreSQL 16 + pgvector

---

## 1. Design Principles

- **Normalization:** 3NF minimum; denormalize only with explicit justification
- **Soft Delete:** All entities use `deleted_at` timestamp; no physical deletes
- **Audit Trail:** All mutations recorded in `audit_logs`
- **Versioning:** Article content uses revision history
- **UUID Primary Keys:** All tables use UUID v7 (time-ordered) for distributed safety
- **Timestamps:** All tables have `created_at`, `updated_at`
- **Tenant Isolation:** All tenant-scoped tables include `organization_id`
- **Row-Level Security:** Enforced via PostgreSQL RLS policies
- **Indexes:** Every foreign key indexed; composite indexes on common query patterns

---

## 2. Entity Relationship Overview

```
organizations ──< users ──< articles ──< article_revisions
      |                │         │
      |                │         ├──< article_tags
      |                │         ├──< article_categories
      |                │         ├──< article_media
      |                │         ├──< article_seo_data
      |                │         ├──< article_geo_data
      |                │         └──< article_ai_analyses
      |                │
      |                ├──< roles
      |                ├──< user_roles
      |                └──< api_keys
      │
      ├──< categories
      ├──< tags
      ├──< media_files
      ├──< rss_feeds
      ├──< news_items
      ├──< workflows
      ├──< workflow_stages
      ├──< plugins
      ├──< themes
      └──< settings
```

---

## 3. Schema Definitions

### 3.1 Core Identity & Auth

```sql
-- Organizations (multi-tenant root)
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL UNIQUE,
    domain          VARCHAR(255),
    logo_url        VARCHAR(500),
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',
    settings        JSONB NOT NULL DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Users
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    email               VARCHAR(255) NOT NULL,
    email_verified_at   TIMESTAMPTZ,
    password_hash       VARCHAR(255),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    display_name        VARCHAR(200),
    avatar_url          VARCHAR(500),
    bio                 TEXT,
    timezone            VARCHAR(100) NOT NULL DEFAULT 'UTC',
    locale              VARCHAR(20) NOT NULL DEFAULT 'en',
    mfa_enabled         BOOLEAN NOT NULL DEFAULT false,
    mfa_secret          VARCHAR(255),
    mfa_backup_codes    TEXT[],
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    login_count         INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    is_superadmin       BOOLEAN NOT NULL DEFAULT false,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    UNIQUE(organization_id, email)
);

-- Roles
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,
    permissions     TEXT[] NOT NULL DEFAULT '{}',
    is_system       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

-- User → Role mapping
CREATE TABLE user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by      UUID REFERENCES users(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    UNIQUE(user_id, role_id)
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    family          UUID NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoke_reason   VARCHAR(100),
    user_agent      TEXT,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys (for programmatic access)
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    name            VARCHAR(255) NOT NULL,
    key_prefix      VARCHAR(20) NOT NULL,
    key_hash        VARCHAR(255) NOT NULL UNIQUE,
    permissions     TEXT[] NOT NULL DEFAULT '{}',
    rate_limit      INTEGER NOT NULL DEFAULT 1000,
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- OAuth accounts
CREATE TABLE oauth_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(50) NOT NULL,
    provider_id     VARCHAR(255) NOT NULL,
    access_token    TEXT,
    refresh_token   TEXT,
    token_expires   TIMESTAMPTZ,
    profile         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_id)
);
```

### 3.2 Taxonomy

```sql
-- Categories
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    parent_id       UUID REFERENCES categories(id),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    image_url       VARCHAR(500),
    meta_title      VARCHAR(255),
    meta_description VARCHAR(500),
    seo_data        JSONB NOT NULL DEFAULT '{}',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE(organization_id, slug)
);

-- Tags
CREATE TABLE tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,
    color           VARCHAR(7),
    article_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE(organization_id, slug)
);
```

### 3.3 Articles

```sql
-- Articles (core content entity)
CREATE TABLE articles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    primary_author_id   UUID NOT NULL REFERENCES users(id),
    primary_category_id UUID REFERENCES categories(id),
    
    -- Content
    title               VARCHAR(500) NOT NULL,
    subtitle            VARCHAR(500),
    slug                VARCHAR(500) NOT NULL,
    excerpt             TEXT,
    content             TEXT NOT NULL DEFAULT '',
    content_json        JSONB,                          -- Rich text JSON (Tiptap)
    word_count          INTEGER NOT NULL DEFAULT 0,
    reading_time        SMALLINT NOT NULL DEFAULT 0,    -- minutes
    
    -- Status & Workflow
    status              VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- draft | in_review | approved | scheduled | published | archived | rejected
    workflow_stage_id   UUID,
    assigned_to         UUID REFERENCES users(id),
    
    -- Publishing
    published_at        TIMESTAMPTZ,
    scheduled_at        TIMESTAMPTZ,
    
    -- Flags
    is_breaking         BOOLEAN NOT NULL DEFAULT false,
    is_featured         BOOLEAN NOT NULL DEFAULT false,
    is_premium          BOOLEAN NOT NULL DEFAULT false,
    is_ai_assisted      BOOLEAN NOT NULL DEFAULT false,
    
    -- Featured Image
    featured_image_id   UUID,
    featured_image_url  VARCHAR(500),
    featured_image_alt  VARCHAR(255),
    
    -- Language
    language            VARCHAR(10) NOT NULL DEFAULT 'en',
    translation_of      UUID REFERENCES articles(id),
    
    -- Source (for news intelligence items)
    source_url          VARCHAR(1000),
    source_name         VARCHAR(255),
    news_item_id        UUID,
    
    -- Versioning
    current_revision_id UUID,
    revision_count      INTEGER NOT NULL DEFAULT 0,
    
    -- Stats (denormalized for performance)
    view_count          BIGINT NOT NULL DEFAULT 0,
    share_count         INTEGER NOT NULL DEFAULT 0,
    comment_count       INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    
    UNIQUE(organization_id, slug)
);

-- Article revisions (version history)
CREATE TABLE article_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id),
    version_number  INTEGER NOT NULL,
    title           VARCHAR(500) NOT NULL,
    content         TEXT NOT NULL,
    content_json    JSONB,
    change_summary  VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, version_number)
);

-- Article → Tag mapping
CREATE TABLE article_tags (
    article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (article_id, tag_id)
);

-- Article → Category mapping (secondary categories)
CREATE TABLE article_categories (
    article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (article_id, category_id)
);

-- Article co-authors
CREATE TABLE article_authors (
    article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(50) NOT NULL DEFAULT 'author',
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (article_id, user_id)
);
```

### 3.4 SEO & GEO Data

```sql
-- SEO metadata per article
CREATE TABLE article_seo (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id          UUID NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
    
    -- Basic Meta
    meta_title          VARCHAR(255),
    meta_description    VARCHAR(500),
    canonical_url       VARCHAR(1000),
    robots              VARCHAR(100) NOT NULL DEFAULT 'index,follow',
    
    -- OpenGraph
    og_title            VARCHAR(255),
    og_description      VARCHAR(500),
    og_image_url        VARCHAR(500),
    og_type             VARCHAR(50) NOT NULL DEFAULT 'article',
    
    -- Twitter Card
    twitter_card        VARCHAR(50) NOT NULL DEFAULT 'summary_large_image',
    twitter_title       VARCHAR(255),
    twitter_description VARCHAR(500),
    twitter_image_url   VARCHAR(500),
    
    -- Schema.org JSON-LD (generated)
    schema_jsonld       JSONB NOT NULL DEFAULT '{}',
    
    -- Keywords
    focus_keyword       VARCHAR(255),
    secondary_keywords  TEXT[],
    
    -- Scores (AI-generated)
    seo_score           SMALLINT,
    readability_score   SMALLINT,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GEO (Generative Engine Optimization) metadata
CREATE TABLE article_geo (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id              UUID NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
    
    -- Scores
    llm_readability_score   SMALLINT,
    semantic_richness_score SMALLINT,
    entity_coverage_score   SMALLINT,
    evidence_score          SMALLINT,
    qa_coverage_score       SMALLINT,
    citation_friendliness   SMALLINT,
    geo_total_score         SMALLINT,
    
    -- Structured context
    structured_summary      TEXT,
    key_claims              JSONB NOT NULL DEFAULT '[]',
    entities_covered        JSONB NOT NULL DEFAULT '[]',
    questions_answered      JSONB NOT NULL DEFAULT '[]',
    citations               JSONB NOT NULL DEFAULT '[]',
    
    -- E-E-A-T signals
    eeat_signals            JSONB NOT NULL DEFAULT '{}',
    
    -- Embeddings (for semantic search)
    content_embedding       vector(1536),
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI analysis results
CREATE TABLE article_ai_analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    analysis_type   VARCHAR(100) NOT NULL,
    -- quality_score | hallucination_check | fact_check | entity_extraction
    -- title_optimization | content_refresh | etc.
    provider        VARCHAR(50) NOT NULL,
    model           VARCHAR(100) NOT NULL,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        DECIMAL(10, 6) NOT NULL DEFAULT 0,
    result          JSONB NOT NULL DEFAULT '{}',
    confidence      DECIMAL(4, 3),
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.5 Media Library

```sql
-- Media files
CREATE TABLE media_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    
    -- File info
    filename        VARCHAR(500) NOT NULL,
    original_name   VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    file_size       BIGINT NOT NULL,
    
    -- Storage
    storage_key     VARCHAR(1000) NOT NULL UNIQUE,
    storage_bucket  VARCHAR(255) NOT NULL,
    public_url      VARCHAR(1000),
    cdn_url         VARCHAR(1000),
    
    -- Image metadata
    width           INTEGER,
    height          INTEGER,
    alt_text        VARCHAR(500),
    caption         TEXT,
    
    -- Image variants (WebP, AVIF, thumbnails)
    variants        JSONB NOT NULL DEFAULT '{}',
    
    -- Classification
    folder          VARCHAR(500) NOT NULL DEFAULT '/',
    tags            TEXT[],
    
    -- AI-generated
    ai_description  TEXT,
    ai_tags         TEXT[],
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
```

### 3.6 News Intelligence

```sql
-- RSS/API feed sources
CREATE TABLE news_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(50) NOT NULL,
    -- rss | atom | api | website | newsapi | gnews
    url             VARCHAR(1000) NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    category_hint   VARCHAR(255),
    language        VARCHAR(10) NOT NULL DEFAULT 'en',
    credibility_score SMALLINT NOT NULL DEFAULT 50,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_fetched_at TIMESTAMPTZ,
    fetch_count     INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Raw ingested news items
CREATE TABLE news_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    source_id           UUID NOT NULL REFERENCES news_sources(id),
    
    -- Content
    title               VARCHAR(1000) NOT NULL,
    content             TEXT,
    excerpt             TEXT,
    url                 VARCHAR(2000) NOT NULL,
    url_hash            VARCHAR(64) NOT NULL,  -- SHA-256 for dedup
    
    -- Author
    author_name         VARCHAR(255),
    source_name         VARCHAR(255),
    
    -- Categorization
    category            VARCHAR(255),
    tags                TEXT[],
    language            VARCHAR(10) NOT NULL DEFAULT 'en',
    
    -- Intelligence
    entities            JSONB NOT NULL DEFAULT '[]',
    sentiment           VARCHAR(20),
    cluster_id          UUID,
    is_duplicate        BOOLEAN NOT NULL DEFAULT false,
    duplicate_of        UUID REFERENCES news_items(id),
    
    -- Status
    status              VARCHAR(50) NOT NULL DEFAULT 'new',
    -- new | analyzed | drafted | published | ignored
    article_id          UUID REFERENCES articles(id),
    
    -- Timestamps
    published_at        TIMESTAMPTZ,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(organization_id, url_hash)
);

-- News clusters (grouped related stories)
CREATE TABLE news_clusters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    title           VARCHAR(500),
    summary         TEXT,
    item_count      INTEGER NOT NULL DEFAULT 0,
    trend_score     DECIMAL(5, 2) NOT NULL DEFAULT 0,
    entities        JSONB NOT NULL DEFAULT '[]',
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.7 Editorial Workflow

```sql
-- Workflow definitions
CREATE TABLE workflows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow stages
CREATE TABLE workflow_stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,
    color           VARCHAR(7),
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    requires_role   VARCHAR(100),
    auto_assign_to  UUID REFERENCES users(id),
    is_terminal     BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow assignments
CREATE TABLE article_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    stage_id        UUID NOT NULL REFERENCES workflow_stages(id),
    assigned_to     UUID NOT NULL REFERENCES users(id),
    assigned_by     UUID NOT NULL REFERENCES users(id),
    due_date        TIMESTAMPTZ,
    note            TEXT,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Editorial comments
CREATE TABLE editorial_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id),
    parent_id       UUID REFERENCES editorial_comments(id),
    content         TEXT NOT NULL,
    selection       JSONB,  -- text range selection reference
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
```

### 3.8 Search & Redirects

```sql
-- Redirects
CREATE TABLE redirects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    from_path       VARCHAR(1000) NOT NULL,
    to_url          VARCHAR(2000) NOT NULL,
    status_code     SMALLINT NOT NULL DEFAULT 301,
    hit_count       BIGINT NOT NULL DEFAULT 0,
    last_hit_at     TIMESTAMPTZ,
    note            VARCHAR(500),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, from_path)
);
```

### 3.9 Analytics

```sql
-- Article view events (insert-only)
CREATE TABLE article_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id      UUID NOT NULL REFERENCES articles(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    session_id      VARCHAR(64),
    user_id         UUID REFERENCES users(id),
    referrer        VARCHAR(1000),
    utm_source      VARCHAR(255),
    utm_medium      VARCHAR(255),
    utm_campaign    VARCHAR(255),
    device          VARCHAR(50),
    country         VARCHAR(2),
    region          VARCHAR(100),
    viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (viewed_at);

-- Create monthly partitions
CREATE TABLE article_views_2026_07 
    PARTITION OF article_views 
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

### 3.10 Notifications

```sql
-- Notifications
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(100) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    data            JSONB NOT NULL DEFAULT '{}',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.11 Plugins & Themes

```sql
-- Installed plugins
CREATE TABLE plugins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    version         VARCHAR(50) NOT NULL,
    description     TEXT,
    author          VARCHAR(255),
    homepage        VARCHAR(500),
    config          JSONB NOT NULL DEFAULT '{}',
    hooks           TEXT[],
    is_active       BOOLEAN NOT NULL DEFAULT false,
    installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

-- Active themes
CREATE TABLE themes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    version         VARCHAR(50) NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',
    custom_css      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT false,
    installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);
```

### 3.12 Audit Logs

```sql
-- Immutable audit log
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID,
    before_state    JSONB,
    after_state     JSONB,
    ip_address      INET,
    user_agent      TEXT,
    request_id      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2026_07
    PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

---

## 4. Indexes

```sql
-- Users
CREATE INDEX idx_users_org ON users(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- Articles
CREATE INDEX idx_articles_org ON articles(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_articles_status ON articles(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_articles_author ON articles(primary_author_id);
CREATE INDEX idx_articles_category ON articles(primary_category_id);
CREATE INDEX idx_articles_published ON articles(organization_id, published_at DESC) 
    WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX idx_articles_slug ON articles(organization_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_articles_scheduled ON articles(scheduled_at) 
    WHERE status = 'scheduled' AND deleted_at IS NULL;

-- GEO embeddings (vector search)
CREATE INDEX idx_geo_embedding ON article_geo USING ivfflat (content_embedding vector_cosine_ops)
    WITH (lists = 100);

-- News items
CREATE INDEX idx_news_items_org ON news_items(organization_id);
CREATE INDEX idx_news_items_url ON news_items(organization_id, url_hash);
CREATE INDEX idx_news_items_status ON news_items(organization_id, status);
CREATE INDEX idx_news_items_published ON news_items(published_at DESC);

-- Audit logs
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_org ON audit_logs(organization_id, created_at DESC);

-- Article views
CREATE INDEX idx_views_article ON article_views(article_id, viewed_at DESC);
CREATE INDEX idx_views_org ON article_views(organization_id, viewed_at DESC);

-- Redirects
CREATE INDEX idx_redirects_path ON redirects(organization_id, from_path) 
    WHERE is_active = true;

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC) 
    WHERE read_at IS NULL;
```

---

## 5. Row-Level Security (RLS)

```sql
-- Enable RLS on tenant-scoped tables
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

-- Example policy (application sets current_setting)
CREATE POLICY articles_org_isolation ON articles
    USING (organization_id = current_setting('app.current_org_id')::uuid);
```

---

## 6. Migrations Strategy

- **Tool:** Prisma Migrate
- **Convention:** Descriptive names: `20260708_create_articles_table`
- **Rule:** Never edit existing migrations; always create new ones
- **Seeding:** Separate seed scripts per environment
- **Rollback:** Prisma down migrations for destructive changes

---

*Schema version controlled in `/apps/api/prisma/migrations/`*
