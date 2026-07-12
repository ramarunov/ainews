import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Get organization analytics dashboard' })
  getDashboard(@Query() query: AnalyticsQueryDto, @CurrentUser() user: any) {
    return this.analyticsService.getDashboard(user.organizationId, query.days ?? 30);
  }

  @Get('articles/:id')
  @RequirePermissions('analytics:read')
  @ApiOperation({ summary: 'Get view performance analytics for a single article' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  getArticlePerformance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.analyticsService.getArticlePerformance(id, user.organizationId, query.days ?? 30);
  }
}
