import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateSeriesDto {
  @ApiProperty({ example: 'The AI Regulation Files' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'the-ai-regulation-files' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSeriesDto extends PartialType(CreateSeriesDto) {}

export class AssignArticleToSeriesDto {
  @ApiPropertyOptional({
    description: 'Series to assign the article to. Pass null to remove it from any series.',
  })
  @IsOptional()
  @IsUUID()
  seriesId?: string | null;

  @ApiPropertyOptional({ description: 'Position within the series (lower shows first).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  seriesOrder?: number;
}
