import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InstallPluginDto {
  @ApiProperty({ example: 'SEO Booster' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'seo-booster' })
  @IsString()
  @MaxLength(255)
  slug: string;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  @MaxLength(50)
  version: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  author?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  homepage?: string;

  @ApiProperty({ required: false, description: 'Arbitrary JSON configuration' })
  @IsOptional()
  config?: any;
}

export class UpdatePluginConfigDto {
  @ApiProperty({ description: 'Arbitrary JSON configuration' })
  config: object;
}
