# Software Architecture Document (SAD)
## AI Native News CMS — Enterprise Edition
**Version:** 1.0.0  
**Date:** 2026-07-08  
**Status:** Approved  
**Author:** Architecture Team

---

## 1. Architecture Overview

### 1.1 Architectural Style

The system uses a **Modular Monolith** architecture as its foundation, designed to be split into microservices as load demands. This approach provides:

- **Simplicity** of a monolith during early phases (single deployable, easy transactions, simple debugging)
- **Modularity** to migrate individual modules to independent services when scale demands it
- **Domain isolation** — no cross-module direct database access
- Each module communicates via well-defined interfaces and an internal event bus

### 1.2 Core Architectural Principles

1. **Clean Architecture** — dependency direction always points inward (Domain → Application → Infrastructure)
2. **Domain-Driven Design (DDD)** — bounded contexts per module; rich domain models
3. **SOLID Principles** — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
4. **Repository Pattern** — all data access abstracted behind interfaces
5. **CQRS (Light)** — read queries separated from write commands for performance-critical paths
6. **Event-Driven Architecture** — internal events for cross-module communication; external webhooks for integrations
7. **API-First** — all features exposed via REST API before building UI
8. **12-Factor App** — environment config, stateless processes, backing services as attached resources

### 1.3 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│   Next.js (SSR/ISR)   │   Mobile Apps   │   External APIs           │
└──────────────┬──────────────────────────────────────────────────────┘
               │ HTTPS / WebSocket
┌──────────────▼──────────────────────────────────────────────────────┐
│                          GATEWAY LAYER                               │
│   API Gateway / Nginx   │   Rate Limiting   │   SSL Termination      │
└──────────────┬──────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────────┐
│                     APPLICATION LAYER (NestJS)                       │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │   Auth   │ │ Articles │ │   SEO    │ │   GEO    │ │    AI    │ │
│  │  Module  │ │  Module  │ │  Engine  │ │  Engine  │ │  Engine  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Users   │ │  Media   │ │ Workflow │ │  Search  │ │Analytics │ │
│  │  Module  │ │ Library  │ │  Module  │ │  Module  │ │  Module  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │   News   │ │ Plugins  │ │  Themes  │ │Webhooks  │ │Settings  │ │
│  │  Intel.  │ │  System  │ │  System  │ │  Module  │ │  Module  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                                      │
│              Internal Event Bus (NestJS EventEmitter)                │
└──────────────┬──────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────────┐
│                      INFRASTRUCTURE LAYER                            │
│                                                                      │
│  PostgreSQL    Redis       OpenSearch    S3/MinIO    BullMQ Queues  │
│  (Primary DB)  (Cache/     (Full-text    (Object     (Background    │
│                Sessions)    Search)      Storage)    Workers)       │
└──────────────────────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────────┐
│                       EXTERNAL SERVICES                              │
│  OpenAI │ Anthropic │ Google AI │ OpenRouter │ Ollama │ News APIs   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack Decisions

### 2.1 Frontend: Next.js 15 + React 19

**Decision:** Next.js with App Router  
**Rationale:**
- Server-Side Rendering (SSR) for SEO-critical public pages
- Incremental Static Regeneration (ISR) for high-traffic articles
- React Server Components for reduced client bundle size
- Edge rendering capabilities
- Built-in Image Optimization

**Alternatives considered:**
- Remix: Less mature ecosystem, fewer enterprise deployments
- SvelteKit: Excellent but React ecosystem more mature for enterprise dashboards
- Nuxt.js: Vue ecosystem not preferred by target engineering teams

### 2.2 Backend: NestJS + TypeScript

**Decision:** NestJS with TypeScript  
**Rationale:**
- Modular architecture aligns with our domain-driven design
- First-class TypeScript support
- Built-in dependency injection
- Decorator-based, familiar to Angular/Spring developers
- Excellent testing utilities (supertest integration)
- Active enterprise adoption

**Alternatives considered:**
- Express.js: Too unopinionated; would require building all structure manually
- Fastify: Good performance, less mature ecosystem for enterprise features
- Hapi.js: Less maintained

### 2.3 Database: PostgreSQL 16

**Decision:** PostgreSQL as primary OLTP database  
**Rationale:**
- ACID compliance for editorial data integrity
- JSONB for flexible metadata storage
- Full-text search (fallback when OpenSearch is unavailable)
- Mature, proven at massive scale
- pgvector extension for vector embeddings

**ORM:** Prisma  
**Rationale:** Type-safe, auto-generated types, excellent migration tooling

### 2.4 Cache & Message Broker: Redis 7

**Decision:** Redis for both caching and message queuing  
**Rationale:**
- Session store
- API response caching
- Rate limiting counters
- BullMQ requires Redis (battle-tested queue library)
- Pub/Sub for real-time features

### 2.5 Search: OpenSearch 2.x

**Decision:** OpenSearch (AWS-compatible Elasticsearch fork)  
**Rationale:**
- Full-text search with relevance scoring
- Faceted search support
- Can be self-hosted without licensing concerns
- Compatible with Elasticsearch clients
- Supports k-NN (vector search) for semantic search

### 2.6 Queue: BullMQ

**Decision:** BullMQ for background job processing  
**Rationale:**
- Redis-based, no additional infrastructure
- Priority queues, delayed jobs, repeatable jobs
- Job progress tracking
- Built-in retry logic with exponential backoff
- Excellent NestJS integration via @nestjs/bull

### 2.7 Object Storage: S3-Compatible (MinIO for dev)

**Decision:** Abstract behind S3-compatible interface  
**Rationale:**
- MinIO for local development
- AWS S3, GCS, Azure Blob, or Cloudflare R2 in production
- No storage vendor lock-in

---

## 3. Module Architecture

### 3.1 Module Structure Convention

Each module follows this directory structure:

```
src/modules/{module-name}/
├── domain/
│   ├── entities/          # Domain entities (no framework deps)
│   ├── value-objects/     # Value objects (immutable)
│   ├── events/            # Domain events
│   ├── exceptions/        # Domain exceptions
│   └── interfaces/        # Repository interfaces
├── application/
│   ├── commands/          # Write operations (CQRS)
│   ├── queries/           # Read operations (CQRS)
│   ├── dtos/              # Data Transfer Objects
│   └── services/          # Application services
├── infrastructure/
│   ├── repositories/      # Concrete repository implementations
│   ├── mappers/           # Entity ↔ ORM model mappers
│   └── subscribers/       # Event subscribers
├── presentation/
│   ├── controllers/       # HTTP controllers
│   ├── guards/            # Route guards
│   └── decorators/        # Custom decorators
└── {module-name}.module.ts
```

### 3.2 Dependency Flow

```
Presentation → Application → Domain
                    ↑
             Infrastructure (implements Domain interfaces)
```

The domain layer has **zero dependencies** on external frameworks. This enables:
- Pure unit testing without database or framework
- Easy migration between ORMs or databases
- Clear business logic boundaries

### 3.3 Module Communication

Modules communicate via:

1. **Direct service injection** (same process, tightly coupled — used sparingly)
2. **Internal event bus** (`EventEmitter2`) — preferred for cross-module side effects
3. **BullMQ queues** — for async, background, or retryable operations

No module directly accesses another module's database tables.

---

## 4. AI Architecture

### 4.1 AI Provider Abstraction

All AI operations go through a **Provider-Agnostic AI Gateway**:

```typescript
interface AIProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(text: string): Promise<number[]>;
  stream(request: CompletionRequest): AsyncIterable<string>;
}
```

Concrete providers implement this interface:
- `OpenAIProvider`
- `AnthropicProvider`
- `GoogleAIProvider`
- `OpenRouterProvider`
- `OllamaProvider`

The `AIGatewayService` handles:
- Provider selection (primary/fallback)
- Token counting and cost tracking
- Rate limiting per provider
- Response caching for identical requests
- Error handling and fallback

### 4.2 AI Module Architecture

```
AI Gateway
    ├── AI Writer Service
    ├── AI Editor Service
    ├── AI SEO Service
    ├── AI GEO Service
    ├── AI Fact Checker Service
    ├── AI Entity Extractor Service
    ├── AI Schema Generator Service
    ├── AI Content Refresh Service
    └── AI Hallucination Detector Service
```

### 4.3 AI Request Pipeline

```
User Request
    → Input Validation
    → Prompt Template (versioned)
    → Context Injection (article content, brand guidelines)
    → Token Count Check
    → Provider Selection
    → Rate Limit Check
    → Cache Check (skip if streaming)
    → AI Provider Call
    → Response Validation
    → Quality Gate (score threshold)
    → Usage Tracking
    → Response
```

---

## 5. Data Architecture

### 5.1 Database Strategy

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| Structured editorial data | PostgreSQL | ACID, relational |
| Search indexes | OpenSearch | Full-text, facets |
| Sessions, cache | Redis | Speed, TTL |
| Media files | S3 | Cost, CDN |
| Vector embeddings | pgvector (PostgreSQL) | Co-located with data |
| Queue jobs | Redis (BullMQ) | Speed, persistence |

### 5.2 Multi-Tenancy Strategy

**Approach:** Schema-per-tenant with shared infrastructure  
- Each organization gets isolated data
- Shared application instances (resource efficient)
- Tenant ID on every table with Row-Level Security (RLS)
- Separate Redis keyspace prefix per tenant

### 5.3 Soft Delete Pattern

All entities implement `DeletedAt` (nullable timestamp). No physical deletes in production. Periodic archival jobs move stale soft-deleted records to archive tables.

### 5.4 Audit Trail

Every write operation records to `audit_logs`:
- Entity type, entity ID
- Action (create/update/delete)
- Actor (user ID)
- Before/after state (JSONB diff)
- IP address, user agent
- Timestamp

---

## 6. Security Architecture

### 6.1 Authentication Flow

```
Login Request
    → Input Sanitization
    → Rate Limit Check (5 attempts / 15 min per IP)
    → User Lookup (timing-safe)
    → bcrypt Compare (cost 12)
    → MFA Check (if enabled)
    → Issue Access Token (JWT, 15m, RS256)
    → Issue Refresh Token (opaque, stored in Redis, 7d)
    → Audit Log Entry
    → Response (Set-Cookie: httpOnly, secure, sameSite=strict)
```

### 6.2 Authorization Model

```
User → Roles → Permissions → Resources
```

Permission format: `{resource}:{action}` (e.g., `articles:publish`)  
Roles are configurable per organization. Built-in roles:
- `super_admin` — full system access
- `admin` — organization admin
- `editor` — full editorial access
- `writer` — create/edit own articles
- `reviewer` — review and approve articles
- `analyst` — read-only analytics

### 6.3 API Security Layers

1. SSL/TLS termination at load balancer
2. Helmet.js (CSP, HSTS, X-Frame-Options, etc.)
3. CORS allowlist
4. Rate limiting (per IP, per user, per API key)
5. JWT validation on every request
6. RBAC permission check
7. Request body validation (class-validator, class-transformer)
8. Input sanitization (DOMPurify for HTML, parameterized queries via Prisma)
9. Response filtering (never expose internal fields)

---

## 7. Performance Architecture

### 7.1 Caching Strategy

| Layer | Technology | TTL | Strategy |
|-------|-----------|-----|----------|
| CDN | Cloudflare/Fastly | 1h-24h | Cache-Control headers |
| SSR | Next.js ISR | 60s-3600s | On-demand revalidation |
| API | Redis | 60s-3600s | Cache-aside |
| DB Queries | Redis | 300s | Read-through for lists |

### 7.2 Cache Invalidation

Cache keys include version tags. On article publish/update:
1. Tag-based invalidation via CDN API
2. Redis `DEL` for affected keys
3. ISR revalidation trigger via `revalidatePath`

### 7.3 Background Processing

All expensive operations run in BullMQ queues:
- AI generation (writer, SEO, GEO)
- Image processing (resize, convert)
- Search index updates
- RSS feed ingestion
- Email sending
- Sitemap regeneration
- Content audits

---

## 8. Deployment Architecture

### 8.1 Container Strategy

Every service runs in Docker containers. Images are built via multi-stage Dockerfile for minimal production image size.

### 8.2 Kubernetes Configuration

```
Namespace: ainews-{environment}
    ├── Deployments
    │   ├── api (3 replicas min, HPA: CPU >70%)
    │   ├── web (2 replicas min, HPA: CPU >70%)
    │   └── worker (2 replicas, BullMQ workers)
    ├── StatefulSets
    │   ├── postgresql
    │   └── redis
    ├── Services
    │   ├── api-service (ClusterIP)
    │   ├── web-service (ClusterIP)
    │   └── worker-service (ClusterIP)
    ├── Ingress
    │   └── nginx-ingress (TLS via cert-manager)
    ├── ConfigMaps
    │   └── app-config
    └── Secrets
        └── app-secrets (sealed-secrets or Vault)
```

### 8.3 CI/CD Pipeline

```
Git Push → GitHub Actions
    → Lint + Type Check
    → Unit Tests
    → Integration Tests
    → Security Scan (Trivy, npm audit)
    → Build Docker Images
    → Push to Registry
    → Deploy to Staging
    → E2E Tests
    → Manual Approval Gate (production)
    → Deploy to Production
    → Smoke Tests
    → Rollback on Failure
```

---

## 9. Observability

### 9.1 Logging

- **Format:** Structured JSON (winston)
- **Levels:** error, warn, info, debug
- **Transport:** stdout → log aggregation (Loki/CloudWatch/Datadog)
- **Correlation IDs:** Every request gets a UUID (X-Request-ID header)

### 9.2 Metrics

- **Application:** Prometheus metrics (custom + default NestJS)
- **Dashboard:** Grafana
- **Alerts:** PagerDuty / Opsgenie

Key metrics:
- HTTP request rate, latency, error rate
- Queue depth and processing time
- AI provider latency and cost
- Cache hit rate
- Database query times

### 9.3 Tracing

- **OpenTelemetry** (provider-agnostic)
- **Backends:** Jaeger (self-hosted) or Honeycomb/Datadog (cloud)

### 9.4 Health Checks

Every service exposes:
- `GET /health` — liveness probe
- `GET /health/ready` — readiness probe (checks DB, Redis, OpenSearch)

---

## 10. Disaster Recovery

| Scenario | RTO | RPO | Strategy |
|----------|-----|-----|----------|
| App pod failure | 30s | 0 | K8s auto-restart, multiple replicas |
| Database failure | 5m | 1m | Hot standby, streaming replication |
| Redis failure | 5m | 0 | Redis Cluster, Sentinel |
| Zone failure | 15m | 5m | Multi-AZ deployment |
| Region failure | 1h | 15m | S3 cross-region, DB snapshots |
| Data corruption | 4h | 24h | Daily snapshots, PITR (PostgreSQL) |

---

*This document should be reviewed and updated with each major architectural change. ADR (Architecture Decision Records) should be created in `/docs/adr/` for every significant decision.*
