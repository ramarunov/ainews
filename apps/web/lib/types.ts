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
  featuredImageId?: string | null;
  featuredImageUrl?: string | null;
  primaryCategoryId?: string | null;
  primaryCategory?: Category | null;
  articleTags?: { tag: Tag }[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
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

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; displayName?: string | null; email: string } | null;
}
