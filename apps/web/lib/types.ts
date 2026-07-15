export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type ArticleStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "ARCHIVED"
  | "REJECTED";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  organizationId: string;
  isSuperadmin?: boolean;
  permissions: string[];
}

export interface AiProviderStatus {
  openai: boolean;
  anthropic: boolean;
  google: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  parentId?: string;
}

export interface CreateTagInput {
  name: string;
  description?: string;
  color?: string;
}

export interface ArticleSeries {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  articleCount?: number;
  createdAt: string;
}

export interface ArticleSeriesArticle {
  id: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  seriesOrder: number | null;
  publishedAt: string | null;
}

export interface ArticleSeriesDetail extends ArticleSeries {
  articles: ArticleSeriesArticle[];
}

export interface CreateSeriesInput {
  name: string;
  slug?: string;
  description?: string;
}

export interface Article {
  id: string;
  title: string;
  subtitle?: string | null;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  status: ArticleStatus;
  isBreaking: boolean;
  isFeatured: boolean;
  isAiAssisted?: boolean;
  featuredImageId?: string | null;
  featuredImageUrl?: string | null;
  primaryCategoryId?: string | null;
  primaryCategory?: Category | null;
  articleTags?: { tag: Tag }[];
  seriesId?: string | null;
  seriesOrder?: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface ArticleAiAnalysis {
  id: string;
  articleId: string;
  analysisType: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  result: {
    hallucination?: {
      overallConfidence: number;
      claims: Array<{ text: string; confidence: number; flag: string; reason: string }>;
      recommendation: string;
    };
    qualityScore?: {
      overall: number;
      breakdown: Record<string, number>;
      issues: string[];
      recommendations: string[];
      canPublish: boolean;
    };
    decision?: string;
  };
  confidence?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface PublicArticleSeo {
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
}

export interface PublicAuthor {
  id: string;
  displayName?: string | null;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface PublicArticle {
  id: string;
  title: string;
  subtitle?: string | null;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  publishedAt?: string | null;
  featuredImageUrl?: string | null;
  featuredImageAlt?: string | null;
  isBreaking?: boolean;
  isFeatured?: boolean;
  isAiAssisted?: boolean;
  readingTime?: number;
  primaryAuthor?: PublicAuthor | null;
  primaryCategory?: Category | null;
  articleTags?: { tag: Tag }[];
  seoData?: PublicArticleSeo | null;
}

export interface PublicSetting {
  key: string;
  value: unknown;
  isPublic: boolean;
}

// Search results come back from SearchService (OpenSearch, or the DB
// fallback when OpenSearch is unreachable) rather than ArticlesService's
// fully-populated include set — no nested primaryCategory/primaryAuthor
// objects, and OpenSearch's indexed documents don't store featuredImageUrl
// at all. Kept as its own narrower type instead of pretending it's a full
// PublicArticle.
export interface PublicSearchResult {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  publishedAt?: string | null;
  featuredImageUrl?: string | null;
}

export interface CreateArticleInput {
  title: string;
  subtitle?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  primaryCategoryId?: string;
  tagIds?: string[];
  featuredImageId?: string;
  isBreaking?: boolean;
  isFeatured?: boolean;
}

export interface MediaFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  publicUrl: string | null;
  cdnUrl: string | null;
  altText?: string | null;
  caption?: string | null;
  folder: string;
  createdAt: string;
}

export interface SeoScoreBreakdown {
  total: number;
  details: {
    keywordInTitle: number;
    keywordInFirstParagraph: number;
    keywordDensity: number;
    metaDescription: number;
    headingStructure: number;
    wordCount: number;
    internalLinks: number;
    imageAltText: number;
    urlStructure: number;
    schemaMarkup: number;
    readability: number;
  };
  recommendations: string[];
}

export interface GeoScore {
  total: number;
  breakdown: {
    llmReadability: number;
    semanticRichness: number;
    entityCoverage: number;
    evidence: number;
    qaCoverage: number;
    citationFriendliness: number;
  };
  structuredSummary?: string;
  keyClaims: string[];
  entitiesCovered: string[];
  questionsAnswered: string[];
  recommendations: string[];
}

export interface QualityScoreResult {
  overall: number;
  breakdown: {
    writingQuality: number;
    factualAccuracy: number;
    seoOptimization: number;
    geoOptimization: number;
    completeness: number;
    originality: number;
  };
  issues: string[];
  recommendations: string[];
  canPublish: boolean;
}

export interface HallucinationResult {
  overallConfidence: number;
  claims: Array<{
    text: string;
    confidence: number;
    flag: "VERIFIED" | "LIKELY_TRUE" | "UNVERIFIED" | "VERIFY_REQUIRED" | "DISPUTED";
    reason: string;
  }>;
  recommendation: "SAFE_TO_PUBLISH" | "REVIEW_BEFORE_PUBLISH" | "DO_NOT_PUBLISH";
}

export interface ExtractedEntity {
  text: string;
  type: "PERSON" | "ORGANIZATION" | "LOCATION" | "DATE" | "PRODUCT" | "EVENT" | "OTHER";
  confidence: number;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface WorkflowUser {
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface OrgUser {
  id: string;
  email: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface OrgRole {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isSystem: boolean;
}

export interface OrgMember {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  isActive: boolean;
  isSuperadmin: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  userRoles: { role: { id: string; name: string; slug: string } }[];
}

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface WorkflowStage {
  id: string;
  workflowId: string;
  name: string;
  slug: string;
  color?: string | null;
  sortOrder: number;
  requiresRole?: string | null;
  isTerminal: boolean;
}

export interface WorkflowBoardCard {
  id: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  workflowStageId: string | null;
  updatedAt: string;
  assignedUser?: WorkflowUser | null;
}

export interface WorkflowStageWithCards extends WorkflowStage {
  articles: WorkflowBoardCard[];
}

export interface WorkflowBoard extends Workflow {
  stages: WorkflowStageWithCards[];
  unassigned: WorkflowBoardCard[];
}

export type NewsSourceType = "RSS" | "ATOM" | "NEWSAPI" | "GNEWS" | "WEBSITE" | "MANUAL";
export type NewsItemStatus = "NEW" | "ANALYZED" | "DRAFTED" | "PUBLISHED" | "IGNORED";

export interface NewsSource {
  id: string;
  name: string;
  type: NewsSourceType;
  url: string;
  categoryHint?: string | null;
  language: string;
  credibilityScore: number;
  isActive: boolean;
  lastFetchedAt?: string | null;
  fetchCount: number;
  errorCount: number;
  lastError?: string | null;
}

export interface NewsItem {
  id: string;
  sourceId: string;
  title: string;
  excerpt?: string | null;
  url: string;
  authorName?: string | null;
  sourceName?: string | null;
  category?: string | null;
  status: NewsItemStatus;
  articleId?: string | null;
  publishedAt?: string | null;
  fetchedAt: string;
}

export interface AnalyticsTopArticle {
  articleId: string;
  views: number;
  title: string | null;
  slug: string | null;
}

export interface AnalyticsDashboard {
  period: { days: number; since: string };
  totalViews: number;
  totalArticles: number;
  publishedInPeriod: number;
  topArticles: AnalyticsTopArticle[];
  dailyViews: { date: string; views: number }[];
}

export interface EditorialComment {
  id: string;
  articleId: string;
  authorId: string;
  parentId?: string | null;
  content: string;
  resolvedAt?: string | null;
  createdAt: string;
  author?: WorkflowUser;
  replies: EditorialComment[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; displayName?: string | null; email: string } | null;
}

export interface Redirect {
  id: string;
  fromPath: string;
  toUrl: string;
  statusCode: number;
  hitCount: string;
  lastHitAt?: string | null;
  note?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface NotFoundLogEntry {
  id: string;
  path: string;
  referrer?: string | null;
  hitCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolved: boolean;
}
