import {
  Controller,
  Get,
  Post,
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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';

import { NewsIntelligenceService } from './news-intelligence.service';
import {
  CreateNewsSourceDto,
  UpdateNewsSourceDto,
  NewsSourceQueryDto,
  CreateNewsItemDto,
  UpdateItemStatusDto,
  NewsItemQueryDto,
} from './dto/news-intelligence.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('News Intelligence')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'news-intelligence', version: '1' })
export class NewsIntelligenceController {
  constructor(private readonly newsIntelligenceService: NewsIntelligenceService) {}

  // ─── Sources ───────────────────────────────────────────────────────────────

  @Post('sources')
  @RequirePermissions('news:manage-sources')
  @ApiOperation({ summary: 'Create a new news source' })
  @ApiResponse({ status: 201, description: 'News source created' })
  createSource(@Body() dto: CreateNewsSourceDto, @CurrentUser() user: any) {
    return this.newsIntelligenceService.createSource(dto, user.organizationId);
  }

  @Get('sources')
  @RequirePermissions('news:read')
  @ApiOperation({ summary: 'List news sources' })
  findAllSources(@Query() query: NewsSourceQueryDto, @CurrentUser() user: any) {
    return this.newsIntelligenceService.findAllSources(user.organizationId, query);
  }

  @Get('sources/:id')
  @RequirePermissions('news:read')
  @ApiOperation({ summary: 'Get news source by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOneSource(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.newsIntelligenceService.findOneSource(id, user.organizationId);
  }

  @Patch('sources/:id')
  @RequirePermissions('news:manage-sources')
  @ApiOperation({ summary: 'Update a news source' })
  updateSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsSourceDto,
    @CurrentUser() user: any,
  ) {
    return this.newsIntelligenceService.updateSource(id, dto, user.organizationId);
  }

  @Delete('sources/:id')
  @RequirePermissions('news:manage-sources')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a news source' })
  removeSource(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.newsIntelligenceService.removeSource(id, user.organizationId);
  }

  @Post('sources/:id/ingest')
  @RequirePermissions('news:manage-sources')
  @ApiOperation({ summary: 'Trigger ingestion for a news source (queued via BullMQ)' })
  ingestSource(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.newsIntelligenceService.enqueueAndAwaitIngest(id, user.organizationId);
  }

  // ─── Items ─────────────────────────────────────────────────────────────────

  @Post('items')
  @RequirePermissions('news:write')
  @ApiOperation({ summary: 'Manually create a news item' })
  createItem(@Body() dto: CreateNewsItemDto, @CurrentUser() user: any) {
    return this.newsIntelligenceService.createItem(dto, user.organizationId);
  }

  @Get('items')
  @RequirePermissions('news:read')
  @ApiOperation({ summary: 'List news items with filtering and pagination' })
  findAllItems(@Query() query: NewsItemQueryDto, @CurrentUser() user: any) {
    return this.newsIntelligenceService.findAllItems(user.organizationId, query);
  }

  @Get('items/:id')
  @RequirePermissions('news:read')
  @ApiOperation({ summary: 'Get news item by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOneItem(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.newsIntelligenceService.findOneItem(id, user.organizationId);
  }

  @Patch('items/:id/status')
  @RequirePermissions('news:write')
  @ApiOperation({ summary: 'Update news item status' })
  updateItemStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.newsIntelligenceService.updateItemStatus(id, dto.status, user.organizationId);
  }

  @Patch('items/:id/ignore')
  @RequirePermissions('news:write')
  @ApiOperation({ summary: 'Ignore a news item' })
  ignoreItem(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.newsIntelligenceService.ignoreItem(id, user.organizationId);
  }

  @Post('items/:id/draft')
  @RequirePermissions('news:write')
  @ApiOperation({ summary: 'One-click create an article draft from a news item' })
  createDraftFromItem(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.newsIntelligenceService.createDraftFromItem(id, user.id, user.organizationId);
  }
}
