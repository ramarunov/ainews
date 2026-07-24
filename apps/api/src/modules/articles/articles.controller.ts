import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { ArticlesService } from './articles.service';
import { CreateArticleDto, UpdateArticleDto, ArticleQueryDto, ArticleCalendarQueryDto } from './dto/article.dto';
import { JwtOrApiKeyAuthGuard } from '../../common/guards/jwt-or-api-key-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Articles')
@ApiBearerAuth('JWT')
// Accepts either a dashboard JWT or a programmatic API key (X-API-Key
// header) - the one controller wired up as the concrete, tested example of
// API keys actually authenticating real requests, not just existing as an
// unused DB model.
@UseGuards(JwtOrApiKeyAuthGuard, PermissionsGuard)
@Controller({ path: 'articles', version: '1' })
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Create a new article' })
  @ApiResponse({ status: 201, description: 'Article created' })
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: any) {
    return this.articlesService.create(dto, user.id, user.organizationId);
  }

  @Get()
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'List articles with filtering and pagination' })
  findAll(@Query() query: ArticleQueryDto, @CurrentUser() user: any) {
    return this.articlesService.findAll(query, user.organizationId);
  }

  @Get('calendar')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Articles scheduled or published within a given month, for the editorial calendar' })
  getCalendar(@Query() query: ArticleCalendarQueryDto, @CurrentUser() user: any) {
    return this.articlesService.getCalendar(user.organizationId, query.year, query.month);
  }

  @Get('trash')
  @RequirePermissions('articles:delete')
  @ApiOperation({ summary: 'List trashed (soft-deleted) articles' })
  findTrash(@Query() query: ArticleQueryDto, @CurrentUser() user: any) {
    return this.articlesService.findTrash(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Get article by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.articlesService.findOne(id, user.organizationId);
  }

  @Get(':id/ai-analyses')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'List AI analysis records for an article (autonomous pipeline audit trail)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  listAiAnalyses(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.articlesService.listAiAnalyses(id, user.organizationId);
  }

  @Get('slug/:slug')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Get article by slug' })
  findBySlug(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.articlesService.findBySlug(slug, user.organizationId);
  }

  @Put(':id')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Update article (full)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: any,
  ) {
    return this.articlesService.update(id, dto, user.id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Patch article (partial)' })
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: any,
  ) {
    return this.articlesService.update(id, dto, user.id, user.organizationId);
  }

  @Patch(':id/publish')
  @RequirePermissions('articles:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish article' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.articlesService.publish(id, user.id, user.organizationId);
  }

  @Patch(':id/unpublish')
  @RequirePermissions('articles:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpublish article (archive)' })
  unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.articlesService.unpublish(id, user.id, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('articles:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move article to trash (soft-delete, reversible via restore)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.articlesService.remove(id, user.id, user.organizationId);
  }

  @Patch(':id/restore')
  @RequirePermissions('articles:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore soft-deleted article' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.articlesService.restore(id, user.organizationId);
  }

  @Delete(':id/permanent')
  @RequirePermissions('articles:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a trashed article (irreversible)' })
  permanentlyRemove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.articlesService.permanentlyRemove(id, user.id, user.organizationId);
  }
}
