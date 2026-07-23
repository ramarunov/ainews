import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

// Top-level path segments already owned by a real route (public or
// dashboard) - see apps/web/proxy.ts's PUBLIC_PATH_PREFIXES and
// apps/web/app/robots.ts's DASHBOARD_PATHS. A page slug colliding with one
// of these would either be unreachable (shadowed by the real route) or,
// worse, make a dashboard path segment look like it could be a public page.
// Kept here (not just in apps/web) since this is the authoritative
// validation - the frontend's own copy is UX-only, matching the
// subdomain-reservation split in categories/dto/category.dto.ts.
export const RESERVED_PAGE_SLUGS = [
  'author', 'category', 'news', 'search', 'feed', 'pages',
  'robots.txt', 'sitemap.xml', 'image-sitemap.xml', 'news-sitemap.xml',
  'icon', 'apple-icon',
  'login', 'register', 'forgot-password', 'reset-password', 'oauth-callback',
  'articles', 'categories', 'tags', 'series', 'media', 'article-search',
  'workflow', 'calendar', 'news-intelligence', 'analytics', 'redirects',
  'users', 'api-keys', 'activity', 'system-settings', 'account',
];

export class CreatePageDto {
  @ApiProperty({ example: 'Kebijakan Privasi' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiProperty({
    required: false,
    example: 'kebijakan-privasi',
    description: 'Auto-generated from the title if omitted. Must not collide with a reserved path.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiProperty({
    required: false,
    default: '',
    description: 'HTML from the dashboard rich-text editor - re-sanitized server-side regardless.',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Publicly reachable when true. Unpublished pages 404 for public visitors but stay editable in the dashboard.',
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdatePageDto extends PartialType(CreatePageDto) {}

export class PageQueryDto {
  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 50;
}
