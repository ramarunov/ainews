import { Controller, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { GeoService } from './geo.service';

@ApiTags('GEO')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'geo', version: '1' })
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Post('articles/:id/score')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Calculate GEO score for article' })
  async calculateScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { content: string; title: string },
  ) {
    return this.geoService.calculateGeoScore(dto.content, dto.title, id);
  }

  @Post('articles/:id/structured-context')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Generate structured context for LLM consumption' })
  async structuredContext(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { content: string; title: string },
  ) {
    return this.geoService.generateStructuredContext(dto.content, dto.title);
  }

  @Post('articles/:id/eeat')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'Analyze E-E-A-T signals for article' })
  async analyzeEeaT(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { content: string; authorBio?: string },
  ) {
    return this.geoService.analyzeEeaT(dto.content, dto.authorBio);
  }
}
