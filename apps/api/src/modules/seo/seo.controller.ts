import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { SeoService } from './seo.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('SEO')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'seo', version: '1' })
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Post('articles/:id/generate')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Generate full SEO data for article' })
  async generateSeo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: { siteUrl: string; focusKeyword?: string },
    @CurrentUser() _user: any,
  ) {
    // In production, fetch article from DB and pass it
    return { message: 'SEO generation queued', articleId: id };
  }

  @Post('articles/:id/score')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Calculate SEO score for article content' })
  async calculateScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: {
      content: string;
      title: string;
      focusKeyword?: string;
      slug?: string;
    },
  ) {
    return this.seoService.calculateSeoScore(dto.content, dto.title, {
      focusKeyword: dto.focusKeyword,
      slug: dto.slug,
    });
  }

  @Get('sitemap')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Get sitemap entries for organization' })
  async getSitemap(@CurrentUser() user: any) {
    return this.seoService.getSitemapEntries(user.organizationId);
  }

  @Post('schema/article')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Generate Article JSON-LD schema' })
  async generateArticleSchema(
    @Body() dto: { title: string; slug: string; siteUrl: string; excerpt?: string },
  ) {
    return this.seoService.generateArticleSchema(dto, dto.siteUrl);
  }

  @Post('schema/faq')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Generate FAQ JSON-LD schema' })
  async generateFaqSchema(
    @Body() dto: { faqs: Array<{ question: string; answer: string }> },
  ) {
    return this.seoService.generateFaqSchema(dto.faqs);
  }
}
