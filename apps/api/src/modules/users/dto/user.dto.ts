import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsEmail,
  IsArray,
  MinLength,
  MaxLength,
  IsUrl,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// E-E-A-T author signals, rendered on the /author page and into every
// article's Person JSON-LD. Stored on user.metadata.authorProfile.
export class AuthorProfileDto {
  @ApiProperty({ required: false, example: 'Editor Redaksi', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiProperty({ required: false, example: 'Editorial Team', maxLength: 120, description: 'English job title for the /en/ edition' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitleEn?: string;

  @ApiProperty({ required: false, maxLength: 2000, description: 'English bio for the /en/ edition' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bioEn?: string;

  @ApiProperty({ required: false, type: [String], description: 'Off-site profile URLs (LinkedIn, X, ...)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  sameAs?: string[];

  @ApiProperty({ required: false, type: [String], description: 'Areas of expertise / topics covered' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  knowsAbout?: string[];
}

export class CreateUserDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'TempPass123!', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ required: false, type: [String], description: 'Role ids to assign immediately' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @ApiProperty({ required: false, type: AuthorProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorProfileDto)
  authorProfile?: AuthorProfileDto;
}

export class UpdateOwnProfileDto extends UpdateUserDto {}

export class UserQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  page?: number = 1;

  @IsOptional()
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class AssignRoleDto {
  @ApiProperty({ example: 'b3f1e2c4-1234-4567-8901-abcdefabcdef' })
  @IsUUID()
  roleId: string;
}

export class EraseAccountDto {
  @ApiProperty({
    required: false,
    description: 'Current password, required to confirm erasure unless the account has none (OAuth-only).',
  })
  @IsOptional()
  @IsString()
  password?: string;
}
