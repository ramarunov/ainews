import { IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CommentStatus } from '@prisma/client';

export class SubmitCommentDto {
  @ApiProperty({ example: 'Jane Reader' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  authorName: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @MaxLength(255)
  authorEmail: string;

  @ApiProperty({ example: 'Great reporting on this story.' })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  content: string;

  @ApiProperty({ required: false, description: 'Set to reply to another comment on the same article' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class ModerateCommentDto {
  @ApiProperty({ enum: CommentStatus })
  @IsEnum(CommentStatus)
  status: CommentStatus;
}

export class CommentQueryDto {
  @ApiProperty({ required: false, enum: CommentStatus })
  @IsOptional()
  @IsEnum(CommentStatus)
  status?: CommentStatus;

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
