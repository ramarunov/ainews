import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InstallThemeDto {
  @ApiProperty({ example: 'Modern Editorial' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'modern-editorial' })
  @IsString()
  @MaxLength(255)
  slug: string;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  @MaxLength(50)
  version: string;

  @ApiProperty({ required: false, description: 'Arbitrary JSON configuration' })
  @IsOptional()
  config?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customCss?: string;
}

export class UpdateThemeConfigDto {
  @ApiProperty({ description: 'Arbitrary JSON configuration' })
  config: object;
}
