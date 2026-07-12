# AI Architecture & Intelligence Design Document (AIDD)
## AI Native News CMS — Enterprise Edition
**Version:** 1.0.0  
**Date:** 2026-07-08

---

## 1. AI Philosophy

This platform treats AI as **infrastructure, not a feature**. Every editorial operation has an AI-assisted path. However, the platform enforces a strict **Human-in-the-Loop** principle for all published output:

> **AI proposes. Humans approve. The platform publishes.**

AI is never allowed to autonomously publish content without a human review gate. This is both an ethical requirement and a trust requirement for news organizations.

---

## 2. AI Provider Architecture

### 2.1 Provider Abstraction Layer

```typescript
// Core AI Gateway Interface
interface AIProvider {
  readonly name: string;
  readonly supportedModels: string[];
  
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;
  embed(text: string | string[]): Promise<EmbeddingResponse>;
  countTokens(text: string, model: string): number;
}

interface CompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;       // 0.0–2.0
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  jsonSchema?: object;
  seed?: number;              // reproducibility
  metadata?: Record<string, string>;
}

interface CompletionResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  finishReason: 'stop' | 'length' | 'content_filter';
  latencyMs: number;
}
```

### 2.2 Provider Registry

```typescript
// Providers register themselves at startup
class AIProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();
  
  register(provider: AIProvider): void;
  get(name: string): AIProvider;
  getAvailable(): AIProvider[];
  
  // Select best provider for task type
  selectForTask(task: AITaskType, preferences?: ProviderPreference): AIProvider;
}
```

### 2.3 AI Gateway Service (Router + Circuit Breaker)

```
Request
  │
  ├─ Token Count Check (reject if exceeds model context)
  │
  ├─ Cache Lookup (Redis, keyed by hash of prompt+model)
  │
  ├─ Rate Limit Check (per provider, per user, per org)
  │
  ├─ Cost Budget Check (org-level monthly budget)
  │
  ├─ Primary Provider Call
  │   └─ Circuit Breaker (open after 5 failures in 60s)
  │        └─ Fallback Provider Call (if circuit open)
  │
  ├─ Response Validation (JSON schema if structured output)
  │
  ├─ Usage Recording (async, to DB)
  │
  └─ Response
```

### 2.4 Provider Capabilities Matrix

| Provider | Text | JSON | Stream | Embed | Vision | Cost |
|----------|------|------|--------|-------|--------|------|
| GPT-4o | ✅ | ✅ | ✅ | ❌ | ✅ | $$$ |
| GPT-4o-mini | ✅ | ✅ | ✅ | ❌ | ✅ | $ |
| text-embedding-3-large | ❌ | ❌ | ❌ | ✅ | ❌ | $ |
| Claude 3.5 Sonnet | ✅ | ✅ | ✅ | ❌ | ✅ | $$ |
| Gemini 1.5 Pro | ✅ | ✅ | ✅ | ✅ | ✅ | $$ |
| Llama 3.1 (Ollama) | ✅ | ✅ | ✅ | ✅ | ❌ | Free |
| OpenRouter | ✅ | ✅ | ✅ | ❌ | ✅ | varies |

---

## 3. Prompt Engineering Architecture

### 3.1 Prompt Template System

All prompts are versioned, stored, and managed as templates:

```typescript
interface PromptTemplate {
  id: string;
  name: string;
  version: string;          // semver
  task: AITaskType;
  systemPrompt: string;     // Handlebars template
  userPrompt: string;       // Handlebars template
  expectedOutput: 'text' | 'json';
  jsonSchema?: object;
  recommendedModel: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  tags: string[];
}
```

Templates are stored in the database with version history, allowing:
- A/B testing of prompt variants
- Rollback to previous prompt versions
- Per-organization prompt customization

### 3.2 Context Injection System

Every AI call receives enriched context:

```
[System Prompt]
You are an expert news editor for {organization.name}.
Brand Voice: {organization.brandVoice}
Editorial Guidelines: {organization.editorialGuidelines}
Audience: {organization.targetAudience}

[User Prompt Template]
Task: {task}
Article Title: {article.title}
Article Content: {article.content}
Category: {article.category}
Target Keyword: {seo.focusKeyword}
```

### 3.3 Output Validation

All structured AI outputs are validated against JSON Schema before use:
- Invalid JSON → retry once with explicit format instruction
- Schema mismatch → parse best-effort, flag for review
- Empty output → mark as failed, log for debugging

---

## 4. AI Modules

### 4.1 AI Writer

**Purpose:** Generate full article drafts from outlines or news items

**Input:**
```json
{
  "title": "string",
  "outline": ["string"],
  "tone": "formal | casual | authoritative | conversational",
  "targetLength": 1200,
  "focusKeyword": "string",
  "targetAudience": "string",
  "sources": [{"title": "string", "url": "string", "excerpt": "string"}]
}
```

**Pipeline:**
1. Research synthesis (summarize provided sources)
2. Outline expansion
3. Section drafting (each H2 section independently)
4. Introduction and conclusion generation
5. Transition smoothing
6. Quality gate check

**Output Validation:**
- Minimum word count met
- All outline points addressed
- No obvious hallucinations (cross-check entity claims)
- Reading level appropriate

### 4.2 AI Hallucination Detector

**Purpose:** Identify potentially false claims before publication

**Method:**
1. Extract all factual claims from article (dates, statistics, names, quotes)
2. Classify each claim by verifiability (verifiable | opinion | common_knowledge)
3. For verifiable claims: check against provided sources
4. Calculate confidence score per claim
5. Flag claims with confidence < 0.7 for human review

**Output:**
```json
{
  "overallConfidence": 0.87,
  "claims": [
    {
      "text": "The company reported $2.3B revenue in Q4",
      "confidence": 0.45,
      "flag": "VERIFY_REQUIRED",
      "reason": "Specific financial figure not found in provided sources"
    }
  ],
  "recommendation": "REVIEW_BEFORE_PUBLISH"
}
```

### 4.3 AI SEO Optimizer

**Purpose:** Generate and optimize all SEO metadata

**Operations:**
1. **Meta Title:** Generate 5 variants optimized for CTR + keyword
2. **Meta Description:** 155-160 char, action-oriented, includes keyword
3. **Focus Keyword Density:** Analyze and suggest optimal placement
4. **Internal Link Opportunities:** Find relevant existing articles to link to
5. **Schema Generation:** Create appropriate JSON-LD (Article, NewsArticle, FAQ, etc.)

**SEO Score Components:**
| Component | Weight |
|-----------|--------|
| Keyword in title | 15% |
| Keyword in first paragraph | 10% |
| Keyword density (1-3%) | 10% |
| Meta description quality | 10% |
| Heading structure (H1/H2/H3) | 10% |
| Word count adequacy | 10% |
| Internal links present | 10% |
| Image alt text | 5% |
| URL structure | 5% |
| Schema markup | 10% |
| Readability score | 5% |

### 4.4 AI GEO Optimizer

**Purpose:** Optimize content for LLM citation and AI search engines

**GEO Score Components:**

| Component | Weight | Description |
|-----------|--------|-------------|
| LLM Readability | 20% | Clear, unambiguous language; short sentences |
| Semantic Richness | 15% | Covers topic comprehensively; related entities present |
| Entity Coverage | 20% | Named entities properly identified and contextualized |
| Evidence Quality | 20% | Claims backed by citations; primary sources cited |
| Q&A Coverage | 15% | Answers common questions on the topic |
| Machine Structure | 10% | Proper heading hierarchy; structured data present |

**GEO Operations:**
1. **Structured Context Generation:** Create machine-readable summary block
2. **FAQ Extraction:** Generate Q&A pairs from article content
3. **Entity Enrichment:** Identify and add context for all entities
4. **Citation Verification:** Check all external links are live and authoritative
5. **JSON-LD Generation:** Comprehensive schema for LLM consumption

### 4.5 AI Fact Checker

**Purpose:** Verify factual claims using available sources

**Pipeline:**
```
Extract Claims
    → Classify (fact | opinion | common_knowledge | calculation)
    → For each fact:
        → Search internal knowledge base
        → Search cited sources
        → Search news items in database
        → Generate verification verdict
    → Produce fact-check report
```

**Verdicts:** `verified` | `likely_true` | `unverified` | `disputed` | `false`

### 4.6 AI Entity Extractor

**Purpose:** Extract and classify named entities from articles

**Entity Types:**
- `PERSON` — people mentioned
- `ORGANIZATION` — companies, institutions
- `LOCATION` — places (country, city, address)
- `DATE` — temporal references
- `MONEY` — financial figures
- `PERCENT` — percentages
- `PRODUCT` — products and services
- `EVENT` — named events
- `LAW` — legislation, regulations
- `TECHNOLOGY` — tech products, platforms

**Output used for:**
- Automatic entity tagging
- Knowledge graph building
- Internal linking suggestions
- Topic clustering

### 4.7 AI Content Refresh

**Purpose:** Identify and update outdated content

**Staleness Signals:**
- Article age > 6 months
- Mentions of "recent", "current", "latest" with stale dates
- Referenced statistics older than 2 years
- Dead external links
- News items covering same topic with newer information

**Operations:**
1. Identify stale sections
2. Find newer information in news intelligence database
3. Generate updated paragraphs
4. Flag significant changes for human review
5. Update seo/geo scores

### 4.8 AI Trend Detector

**Purpose:** Identify trending topics from ingested news items

**Algorithm:**
1. Cluster news items by semantic similarity (last 24/48/72 hours)
2. Weight clusters by: recency, source credibility, item count
3. Extract trending entities from top clusters
4. Compare against historical baseline (same topic last week/month)
5. Assign trend velocity score

**Output:**
```json
{
  "trends": [
    {
      "topic": "AI regulation in Europe",
      "velocity": 8.7,
      "itemCount": 23,
      "topEntities": ["EU", "AI Act", "OpenAI"],
      "suggestedAngle": "How EU AI Act impacts news publishers",
      "competitorCoverage": ["Reuters", "TechCrunch"]
    }
  ]
}
```

### 4.9 AI Quality Score

**Purpose:** Single composite quality score for every article

**Score Components (0–100):**

| Dimension | Weight | Measured By |
|-----------|--------|-------------|
| Writing Quality | 25% | Grammar, clarity, style, readability |
| Factual Accuracy | 25% | Hallucination detector confidence |
| SEO Optimization | 15% | SEO engine score |
| GEO Optimization | 15% | GEO engine score |
| Completeness | 10% | Topic coverage vs. ideal outline |
| Originality | 10% | Similarity to existing published content |

**Quality Gates:**
- < 60: Cannot publish, major issues flagged
- 60–74: Can publish with editor approval
- 75–89: Standard publish flow
- 90+: Fast-track publish eligible

---

## 5. News Intelligence Pipeline

### 5.1 Full Pipeline Flow

```
[Data Collection]
    RSS Feeds (15 min intervals)
    News APIs (real-time)
    Manual sources
            │
            ▼
[Normalization]
    Unified schema
    HTML stripping
    Date normalization
    Language detection
            │
            ▼
[Deduplication]
    URL hash check (exact)
    Semantic similarity check (embedding cosine > 0.92 = duplicate)
            │
            ▼
[Entity Extraction]
    NER via AI
    Entity graph update
            │
            ▼
[Clustering]
    Semantic similarity grouping
    Cluster metadata generation
    Trend scoring
            │
            ▼
[Intelligence Enrichment]
    Credibility scoring
    Sentiment analysis
    Fact verification (for high-priority items)
            │
            ▼
[Editorial Queue]
    Trend alerts to editors
    Suggested article angles
    One-click draft generation
            │
            ▼
[Draft Generation]
    AI Writer module
    SEO/GEO optimization
    Editorial workflow entry
```

### 5.2 Queue Architecture for Pipeline

```
news:fetch         → Fetch RSS/API feeds (scheduled, every 15m)
news:normalize     → Clean and normalize raw items
news:deduplicate   → Check for duplicates
news:extract       → Extract entities, sentiment
news:cluster       → Group and trend-score
news:alert         → Send trend alerts to editors
ai:draft           → Generate article draft from news item
ai:seo             → Generate SEO metadata
ai:geo             → Calculate GEO score
ai:quality         → Calculate quality score
media:process      → Image resize, format conversion
search:index       → Index article in OpenSearch
sitemap:rebuild    → Regenerate XML sitemaps
email:send         → Send notifications
webhook:dispatch   → Trigger outbound webhooks
```

---

## 6. Embedding & Semantic Search

### 6.1 Embedding Strategy

All articles generate embeddings at publish time using `text-embedding-3-large` (1536 dimensions). Embeddings stored in `article_geo.content_embedding` via pgvector.

**Embedding input:** Title + Excerpt + First 2000 chars of content

**Use cases:**
- Semantic article search
- Duplicate detection in news pipeline
- Internal link suggestions (find semantically similar articles)
- Topic clustering
- Content recommendations

### 6.2 Semantic Search Query

```sql
SELECT a.id, a.title, a.slug,
    1 - (g.content_embedding <=> $1::vector) AS similarity
FROM articles a
JOIN article_geo g ON g.article_id = a.id
WHERE a.organization_id = $2
    AND a.status = 'published'
    AND a.deleted_at IS NULL
ORDER BY g.content_embedding <=> $1::vector
LIMIT 10;
```

---

## 7. AI Cost Management

### 7.1 Cost Tracking

Every AI call records:
- Provider, model
- Input/output token counts
- Calculated cost (USD)
- Operation type
- User and organization

### 7.2 Budget Controls

Organizations can set:
- Monthly AI budget cap (hard stop at 90%, alert at 80%)
- Per-operation cost limit
- Model preference (route to cheaper models when budget is tight)

### 7.3 Cost Optimization Strategies

1. **Response caching** — identical prompts return cached response (1h TTL)
2. **Model routing** — use GPT-4o-mini for simple tasks, GPT-4o only for complex
3. **Input truncation** — smart content summarization before sending to AI
4. **Batch processing** — combine small tasks in single API call where possible
5. **Local fallback** — route to Ollama when cloud cost exceeds threshold

---

## 8. AI Safety & Governance

### 8.1 Content Safety

- All AI outputs screened for harmful content before presenting to users
- AI cannot directly create content that would be rejected by editorial policy
- Hallucination score threshold enforced before draft can enter publish pipeline

### 8.2 Transparency

- Every AI-assisted article marked with `is_ai_assisted = true`
- AI contribution visible to editors (which sections were AI-generated)
- AI model and provider recorded per analysis
- AI-generated content declaration in JSON-LD when required by regulation

### 8.3 Data Privacy

- User content NOT used to train external AI models
- API calls use `user: org_id_hash` for rate tracking without PII exposure
- No article content sent to AI providers if organization has data residency requirements
- Ollama option for fully on-premise AI processing

---

*AI capabilities and provider integration details should be kept current as the AI landscape evolves.*
