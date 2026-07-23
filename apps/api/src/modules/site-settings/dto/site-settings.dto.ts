import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FooterLinkDto {
  @ApiProperty()
  @IsString()
  label: string;

  // Plain @IsUrl rejects site-relative paths like "/search" - a footer
  // link pointing at another page on this same site is at least as common
  // a case here as an external URL (the "Cari Berita" default entry is
  // exactly this), so both an absolute http(s) URL and a leading-slash
  // relative path are accepted.
  @ApiProperty({ example: '/search or https://example.com' })
  @IsString()
  @Matches(/^(\/|https?:\/\/)/, {
    message: 'url must start with / (relative) or http(s):// (absolute)',
  })
  url: string;
}

// WordPress-style footer widget - "categories"/"pages" carry no content of
// their own (auto-populated from live data at render time), so `content`/
// `links` are only meaningful (and only validated when present) for
// "text"/"links" respectively - same lenient "optional, not conditionally
// required" convention as HomepageWidgetDto.html below.
export class FooterWidgetDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ enum: ['text', 'links', 'categories', 'pages'] })
  @IsIn(['text', 'links', 'categories', 'pages'])
  type: 'text' | 'links' | 'categories' | 'pages';

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ required: false, description: 'Required when type is text' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiProperty({ type: [FooterLinkDto], required: false, description: 'Required when type is links' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => FooterLinkDto)
  links?: FooterLinkDto[];
}

export class FooterColumnDto {
  @ApiProperty({ type: [FooterWidgetDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FooterWidgetDto)
  widgets: FooterWidgetDto[];
}

export class UpdateFooterSettingDto {
  @ApiProperty({ type: [FooterColumnDto], description: 'Always exactly 4 columns' })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => FooterColumnDto)
  columns: FooterColumnDto[];
}

export class HomepageWidgetDto {
  @ApiProperty({ enum: ['trending', 'categories', 'custom_html'] })
  @IsIn(['trending', 'categories', 'custom_html'])
  type: 'trending' | 'categories' | 'custom_html';

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ required: false, description: 'Required when type is custom_html' })
  @IsOptional()
  @IsString()
  html?: string;
}

export class UpdateHomepageWidgetsDto {
  @ApiProperty({ type: [HomepageWidgetDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HomepageWidgetDto)
  widgets: HomepageWidgetDto[];
}

export class UpdateHomepageSeoDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({ require_tld: false })
  ogImageUrl?: string;
}

export class UpdateBrandingDto {
  @ApiProperty({ required: false, description: 'Replaces the default logo shown on the public site, login page, and dashboard sidebar' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;

  @ApiProperty({ required: false, description: 'Replaces the default browser tab icon/favicon' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  faviconUrl?: string;
}

export class ScriptSlotDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsString()
  html: string;
}

export class UpdateCustomScriptsDto {
  @ApiProperty({ type: ScriptSlotDto })
  @ValidateNested()
  @Type(() => ScriptSlotDto)
  header: ScriptSlotDto;

  @ApiProperty({ type: ScriptSlotDto })
  @ValidateNested()
  @Type(() => ScriptSlotDto)
  footer: ScriptSlotDto;
}
