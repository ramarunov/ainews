# DevOps & Deployment Guide
## AI Native News CMS — Enterprise Edition
**Version:** 1.0.0  
**Date:** 2026-07-08

---

## 1. Local Development Setup

### 1.1 Prerequisites

```bash
# Required versions
node >= 20.0.0
pnpm >= 9.0.0
docker >= 24.0.0
docker-compose >= 2.0.0
```

### 1.2 First-Time Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/ai-news-cms.git
cd ai-news-cms

# 2. Install dependencies
pnpm install

# 3. Copy environment file
cp .env.example .env
# Edit .env with your values

# 4. Start infrastructure services
pnpm docker:up

# 5. Run database migrations
pnpm db:migrate

# 6. Seed database
pnpm db:seed

# 7. Start development servers
pnpm dev
```

### 1.3 Development URLs

| Service | URL |
|---------|-----|
| Frontend (Next.js) | http://localhost:3000 |
| Backend API (NestJS) | http://localhost:4000 |
| API Documentation | http://localhost:4000/api-docs |
| Database Studio (Prisma) | http://localhost:5555 |
| MinIO Console | http://localhost:9001 |
| Redis Insight | http://localhost:8001 |
| OpenSearch Dashboards | http://localhost:5601 |
| Mailhog (Email) | http://localhost:8025 |
| BullMQ Dashboard | http://localhost:4000/queues |

### 1.4 Testing category subdomains locally

Category subdomains (`ENABLE_CATEGORY_SUBDOMAINS=true`, see
`docs/DEPLOY.md` §7.1 for production) can be exercised locally too.
`apps/web/proxy.ts` strips the port off the `Host` header before comparing
it to `ROOT_DOMAIN`, so **`ROOT_DOMAIN` itself must never include a port**
even though you're browsing on `:3000` locally — the two are independent.

**Quickest option — no DNS/hosts changes at all.** Send the `Host` header
directly with curl against your already-running `pnpm dev`:

```bash
# .env.local (apps/web)
ROOT_DOMAIN=beritabot.local
NEXT_PUBLIC_ROOT_DOMAIN=beritabot.local
ENABLE_CATEGORY_SUBDOMAINS=true
```

```bash
curl -H "Host: beritabot.local" http://localhost:3000/                # apex aggregator
curl -H "Host: kesehatan.beritabot.local" http://localhost:3000/      # that category's homepage (rewritten)
curl -I -H "Host: www.beritabot.local" http://localhost:3000/         # 308 -> beritabot.local
curl -I -H "Host: sembarang.beritabot.local" http://localhost:3000/   # 404, not a fake category
```

This verifies `proxy.ts`'s hostname routing, the www redirect, and the
unknown-subdomain 404 without touching DNS or the hosts file at all.

**Browser option.** On macOS/Linux, `*.localhost` already resolves to
`127.0.0.1` with no setup — set `ROOT_DOMAIN=localhost` and visit
`http://kesehatan.localhost:3000` directly. **Windows does not resolve
`*.localhost` this way**, so add entries to the hosts file instead:

```
# C:\Windows\System32\drivers\etc\hosts (edit as Administrator)
127.0.0.1   beritabot.local
127.0.0.1   kesehatan.beritabot.local
127.0.0.1   teknologi.beritabot.local
```

then visit `http://kesehatan.beritabot.local:3000`. Note that
`getCategoryUrl`/`getArticleUrl` (`apps/web/lib/site-url.ts`) always build
`https://` URLs with no port — correct for production, but it means
in-app nav links generated while testing this way point at
`https://kesehatan.beritabot.local` (wrong scheme/port for a local dev
server), not back to `:3000`. Retype the address bar's port after
following a link, or prefer the curl option above for anything beyond a
quick visual check.

Leave `ENABLE_CATEGORY_SUBDOMAINS` unset (defaults to `false`) for normal
local development that doesn't touch this feature — it's fully opt-in.

---

## 2. Docker Setup

### 2.1 Docker Compose Services

```yaml
# docker-compose.yml configures:
# - PostgreSQL 16 with pgvector
# - Redis 7
# - OpenSearch 2.x
# - MinIO (S3-compatible storage)
# - Mailhog (SMTP for development)
# - Redis Insight (Redis GUI)
```

---

## 3. CI/CD Pipeline

### 3.1 GitHub Actions Workflow

```
On Pull Request:
    1. Install dependencies (pnpm install)
    2. Type check (tsc --noEmit)
    3. Lint (eslint)
    4. Unit tests (jest)
    5. Build check (turbo build)
    6. Security scan (npm audit, Trivy)

On Merge to main:
    1. All PR checks above
    2. Integration tests
    3. Build Docker images
    4. Push to container registry
    5. Deploy to staging
    6. E2E tests on staging
    7. Manual approval gate
    8. Deploy to production
    9. Smoke tests
    10. Rollback on failure
```

### 3.2 Environment Promotion

```
feature branch → development (auto)
development → staging (auto on merge to main)
staging → production (manual approval required)
```

---

## 4. Environment Configuration

### 4.1 Environment Tiers

| Environment | Purpose | Auto-deploy | Production Data |
|-------------|---------|-------------|-----------------|
| development | Local dev | No | No |
| staging | Pre-production testing | Yes (from main) | Anonymized copy |
| production | Live system | Manual approval | Yes |

---

## 5. Infrastructure as Code

### 5.1 Directory Structure

```
infrastructure/
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── Dockerfile.worker
├── kubernetes/
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── api-deployment.yaml
│   │   ├── web-deployment.yaml
│   │   ├── worker-deployment.yaml
│   │   └── ingress.yaml
│   └── overlays/
│       ├── staging/
│       └── production/
└── terraform/
    ├── modules/
    │   ├── vpc/
    │   ├── eks/
    │   ├── rds/
    │   └── elasticache/
    ├── staging/
    └── production/
```

---

## 6. Database Operations

### 6.1 Migrations

```bash
# Create new migration
cd apps/api && npx prisma migrate dev --name descriptive_name

# Apply migrations to staging/production
npx prisma migrate deploy

# View migration status
npx prisma migrate status

# Reset database (DANGEROUS — dev only)
npx prisma migrate reset
```

### 6.2 Backup & Restore

```bash
# Backup (production)
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Automated daily backups via pg_cron or external service
# Backups uploaded to S3 with 30-day retention

# Restore
gunzip -c backup_file.sql.gz | psql $DATABASE_URL
```

### 6.3 Database Monitoring

- Query performance: `pg_stat_statements`
- Slow query log: `log_min_duration_statement = 1000` (1 second)
- Bloat monitoring: `pgbloat` views
- Connection pooling: PgBouncer (transaction mode)

---

## 7. Monitoring & Observability

### 7.1 Metrics Stack

```
Application → Prometheus (scrape /metrics) → Grafana (dashboards)
                                           → Alertmanager → PagerDuty
```

### 7.2 Logging Stack

```
Application → stdout (JSON) → Fluent Bit → Loki → Grafana
```

### 7.3 Key Alerts

| Alert | Threshold | Severity |
|-------|-----------|---------|
| API error rate | >5% over 5 min | Critical |
| API p99 latency | >2000ms | High |
| Database connections | >80% of max | High |
| Redis memory | >85% | High |
| Queue depth (AI) | >500 jobs | Medium |
| Disk usage | >80% | Medium |
| Certificate expiry | <30 days | Medium |

---

## 8. Scaling Guide

### 8.1 Horizontal Scaling

```bash
# Scale API pods
kubectl scale deployment api --replicas=5 -n ainews-production

# HPA configuration: auto-scale 3-10 replicas based on CPU 70%
```

### 8.2 Database Scaling

- **Read replicas:** Add read replica for analytics queries
- **Connection pooling:** PgBouncer (reduces PostgreSQL connection overhead)
- **Partitioning:** `article_views` and `audit_logs` already partitioned by month

### 8.3 Redis Scaling

- **Cluster mode:** Redis Cluster for >10GB dataset or >100k ops/sec
- **Sentinel:** Redis Sentinel for HA without cluster (recommended for moderate load)

---

## 9. Disaster Recovery Runbook

### 9.1 Full Service Restoration

```bash
# 1. Restore database from latest backup
psql $DATABASE_URL < latest_backup.sql

# 2. Restore Redis (optional - most data is in Postgres)
redis-cli --rdb /backup/dump.rdb

# 3. Clear CDN cache
# Via Cloudflare API or manual purge

# 4. Verify application health
curl https://api.ainews.com/health/ready
```

### 9.2 Rollback Procedure

```bash
# Rollback to previous Kubernetes deployment
kubectl rollout undo deployment/api -n ainews-production

# Rollback database migration
cd apps/api && npx prisma migrate resolve --rolled-back migration_name
```

---

*This guide should be tested via disaster recovery drills quarterly.*
