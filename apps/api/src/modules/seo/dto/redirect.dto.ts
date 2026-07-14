import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRedirectDto {
  @ApiProperty({ example: '/old-article-slug' })
  @IsString()
  @MaxLength(1000)
  fromPath: string;

  @ApiProperty({ example: '/news/new-article-slug' })
  @IsString()
  @MaxLength(2000)
  toUrl: string;

  @ApiPropertyOptional({ enum: [301, 302, 410], default: 301 })
  @IsOptional()
  @IsIn([301, 302, 410])
  statusCode?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateRedirectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  toUrl?: string;

  @ApiPropertyOptional({ enum: [301, 302, 410] })
  @IsOptional()
  @IsIn([301, 302, 410])
  statusCode?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResolvePathDto {
  @ApiProperty({ example: '/news/some-path' })
  @IsString()
  @MaxLength(1000)
  path: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  referrer?: string;
}
