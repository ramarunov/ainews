import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ArticleStatus } from '@prisma/client';

export class SearchQueryDto {
  @ApiProperty({ example: 'ai regulation' })
  @IsString()
  q: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiProperty({ required: false, enum: ArticleStatus })
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  limit?: number = 20;
}

export class AutocompleteQueryDto {
  @ApiProperty({ example: 'artif' })
  @IsString()
  q: string;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  limit?: number = 10;
}
