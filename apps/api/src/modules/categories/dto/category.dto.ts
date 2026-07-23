import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  MaxLength,
  MinLength,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, PartialType } from '@nestjs/swagger';

// Reserved subdomain labels - "app"/"api" are this deployment's own
// dashboard/API hosts (infrastructure/caddy/Caddyfile), the rest are
// conventional reservations no category should be able to shadow.
export const RESERVED_SUBDOMAINS = [
  'app', 'api', 'www', 'admin', 'mail', 'ftp', 'cdn', 'static', 'assets',
];

// Valid DNS label: lowercase letters/digits, hyphens allowed in the middle
// only, 1-63 chars (RFC 1035) - Category.subdomain is @db.VarChar(63).
export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class CreateCategoryDto {
  @ApiProperty({ example: 'World News' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false, example: 'world-news' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

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
    example: 'world-news',
    description:
      'Public-site subdomain (e.g. "world-news" -> world-news.beritabot.com). ' +
      'Lowercased and spaces/underscores turned into hyphens automatically; ' +
      'reserved words and uniqueness are enforced in CategoriesService.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/[\s_]+/g, '-')
      : value,
  )
  @Matches(SUBDOMAIN_PATTERN, {
    message:
      'subdomain must be 1-63 characters of lowercase letters, numbers, and hyphens (not leading/trailing)',
  })
  subdomain?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({
    required: false,
    default: true,
    description:
      'Publicly reachable when true (default). Setting this false makes the ' +
      "category's subdomain/articles publicly unreachable without affecting " +
      'CMS/dashboard access to it.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryQueryDto {
  @ApiProperty({
    required: false,
    description: 'Filter by parent category id. Use "null" to select only root categories.',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'When true, return a flat paginated list instead of a nested root/children tree.',
  })
  @IsOptional()
  @IsBoolean()
  flat?: boolean;

  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 20;
}
