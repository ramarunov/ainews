import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { SearchService } from './search.service';
import { SearchQueryDto, AutocompleteQueryDto } from './dto/search.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Search')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('articles')
  @RequirePermissions('search:read')
  @ApiOperation({ summary: 'Full-text search across articles' })
  search(@Query() query: SearchQueryDto, @CurrentUser() user: any) {
    const { q, page, limit, ...filters } = query;
    return this.searchService.search(q, user.organizationId, filters, page, limit, user.id);
  }

  @Get('autocomplete')
  @RequirePermissions('search:read')
  @ApiOperation({ summary: 'Autocomplete article titles' })
  autocomplete(@Query() query: AutocompleteQueryDto, @CurrentUser() user: any) {
    return this.searchService.autocomplete(query.q, user.organizationId, query.limit);
  }

  @Get('analytics')
  @RequirePermissions('search:read')
  @ApiOperation({ summary: 'Search analytics: volume, top queries, zero-result queries' })
  getAnalytics(@Query('days') days: string | undefined, @CurrentUser() user: any) {
    return this.searchService.getAnalytics(user.organizationId, days ? Number(days) : undefined);
  }
}
