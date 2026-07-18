import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FooterLinkDto {
  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  url: string;
}

export class UpdateFooterSettingDto {
  @ApiProperty({ required: false, description: 'Replaces the default tagline text when set' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [FooterLinkDto] })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => FooterLinkDto)
  links: FooterLinkDto[];
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
