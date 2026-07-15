import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { AIWriterService } from './ai-writer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

class GenerateDraftDto {
  @ApiProperty()
  @IsString()
  title: string;

  @IsOptional()
  @IsArray()
  outline?: string[];

  @IsOptional()
  @IsString()
  @IsEnum(['formal', 'casual', 'authoritative', 'conversational'])
  tone?: 'formal' | 'casual' | 'authoritative' | 'conversational';

  @IsOptional()
  @IsNumber()
  @Min(300)
  @Max(10000)
  targetLength?: number;

  @IsOptional()
  @IsString()
  focusKeyword?: string;
}

class RewriteDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsString()
  instruction: string;
}

class TitlesDto {
  @ApiProperty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  focusKeyword?: string;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(20)
  count?: number;
}

class CheckHallucinationsDto {
  @ApiProperty()
  @IsString()
  content: string;
}

class QualityScoreDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsString()
  title: string;
}

class ExtractEntitiesDto {
  @ApiProperty()
  @IsString()
  content: string;
}

@ApiTags('AI')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller({ path: 'ai', version: '1' })
export class AIController {
  constructor(private readonly aiWriter: AIWriterService) {}

  @Post('articles/:id/draft')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Generate article draft with AI' })
  @ApiParam({ name: 'id', type: String })
  async generateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateDraftDto,
    @CurrentUser() user: any,
  ) {
    const draft = await this.aiWriter.generateDraft({
      ...dto,
      organizationId: user.organizationId,
      articleId: id,
    });
    return { draft };
  }

  @Post('articles/:id/titles')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Generate title variants with AI' })
  async generateTitles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TitlesDto,
    @CurrentUser() user: any,
  ) {
    const titles = await this.aiWriter.generateTitles({
      ...dto,
      organizationId: user.organizationId,
      articleId: id,
    });
    return { titles };
  }

  @Post('articles/:id/meta-description')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Generate meta description with AI' })
  async generateMetaDescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { content: string; focusKeyword?: string },
  ) {
    const metaDescription = await this.aiWriter.generateMetaDescription(
      dto.content,
      dto.focusKeyword,
    );
    return { metaDescription };
  }

  @Post('articles/:id/faqs')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Generate FAQ section with AI' })
  async generateFAQs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { content: string; count?: number },
  ) {
    const faqs = await this.aiWriter.generateFAQs(dto.content, dto.count);
    return { faqs };
  }

  @Post('articles/:id/rewrite')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Rewrite text section with AI' })
  async rewrite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RewriteDto,
    @CurrentUser() user: any,
  ) {
    const rewritten = await this.aiWriter.rewriteParagraph({
      content: dto.content,
      instruction: dto.instruction,
      organizationId: user.organizationId,
      articleId: id,
    });
    return { rewritten };
  }

  @Post('articles/:id/hallucination-check')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Check article for potential hallucinations' })
  async checkHallucinations(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckHallucinationsDto,
    @CurrentUser() user: any,
  ) {
    return this.aiWriter.checkHallucinations(dto.content, undefined, user.organizationId, id);
  }

  @Post('articles/:id/quality-score')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Calculate AI quality score for article' })
  async qualityScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QualityScoreDto,
    @CurrentUser() user: any,
  ) {
    return this.aiWriter.calculateQualityScore(
      dto.content,
      dto.title,
      undefined,
      undefined,
      user.organizationId,
      id,
    );
  }

  @Post('articles/:id/entities')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Extract named entities from article' })
  async extractEntities(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtractEntitiesDto,
  ) {
    const entities = await this.aiWriter.extractEntities(dto.content);
    return { entities };
  }

  @Post('articles/:id/image-prompt')
  @RequirePermissions('ai:use')
  @ApiOperation({ summary: 'Generate image prompt for featured image' })
  async imagePrompt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { title: string; excerpt: string },
  ) {
    const prompt = await this.aiWriter.generateImagePrompt(dto.title, dto.excerpt);
    return { prompt };
  }
}
