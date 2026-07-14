import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SeriesService } from './series.service';
import { AssignArticleToSeriesDto, CreateSeriesDto, UpdateSeriesDto } from './dto/series.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Series')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'series', version: '1' })
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post()
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Create an article series/collection' })
  create(@Body() dto: CreateSeriesDto, @CurrentUser() user: any) {
    return this.seriesService.create(dto, user.organizationId);
  }

  @Get()
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'List series with their article count' })
  findAll(@CurrentUser() user: any) {
    return this.seriesService.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Get a series with its ordered articles' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.seriesService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Update a series' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSeriesDto,
    @CurrentUser() user: any,
  ) {
    return this.seriesService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Delete a series (must have no articles assigned)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.seriesService.remove(id, user.organizationId);
  }

  @Patch('articles/:articleId')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Assign (or remove) an article to/from a series' })
  assignArticle(
    @Param('articleId', ParseUUIDPipe) articleId: string,
    @Body() dto: AssignArticleToSeriesDto,
    @CurrentUser() user: any,
  ) {
    return this.seriesService.assignArticle(articleId, dto, user.organizationId);
  }
}
