import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ example: 'Artificial Intelligence' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, example: '#FF5733', description: 'Hex color code' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a valid 6-digit hex color, e.g. #FF5733',
  })
  color?: string;
}

export class UpdateTagDto extends PartialType(CreateTagDto) {}

export class TagQueryDto {
  @ApiProperty({ required: false, description: 'Filter by tag name (case-insensitive contains)' })
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 20;
}
