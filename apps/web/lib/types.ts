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
  permissions: string[];
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
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
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
  publicUrl: string | null;
  cdnUrl: string | null;
}
