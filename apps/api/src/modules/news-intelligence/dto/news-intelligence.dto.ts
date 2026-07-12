import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  IsArray,
  IsUrl,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NewsSourceType, NewsItemStatus } from '@prisma/client';

export class CreateNewsSourceDto {
  @ApiProperty({ example: 'TechCrunch RSS' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: NewsSourceType })
  @IsEnum(NewsSourceType)
  type: NewsSourceType;

  @ApiProperty({ example: 'https://techcrunch.com/feed/' })
  @IsUrl()
  url: string;

  @ApiProperty({ required: false })
  @IsOptional()
  config?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  categoryHint?: string;

  @ApiProperty({ required: false, default: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNewsSourceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false, enum: NewsSourceType })
  @IsOptional()
  @IsEnum(NewsSourceType)
  type?: NewsSourceType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  config?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  categoryHint?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class NewsSourceQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiProperty({ required: false, enum: NewsSourceType })
  @IsOptional()
  @IsEnum(NewsSourceType)
  type?: NewsSourceType;
}

export class CreateNewsItemDto {
  @ApiProperty()
  @IsUUID()
  sourceId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiProperty()
  @IsUrl()
  url: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  authorName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateItemStatusDto {
  @ApiProperty({ enum: NewsItemStatus })
  @IsEnum(NewsItemStatus)
  status: NewsItemStatus;
}

export class NewsItemQueryDto {
  @ApiProperty({ required: false, enum: NewsItemStatus })
  @IsOptional()
  @IsEnum(NewsItemStatus)
  status?: NewsItemStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
