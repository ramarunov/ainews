import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { RedirectsService } from './redirects.service';
import { CreateRedirectDto, UpdateRedirectDto } from './dto/redirect.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('SEO')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'seo/redirects', version: '1' })
export class RedirectsController {
  constructor(private readonly redirectsService: RedirectsService) {}

  @Post()
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Create a redirect' })
  create(@Body() dto: CreateRedirectDto, @CurrentUser() user: any) {
    return this.redirectsService.create(dto, user.organizationId, user.id);
  }

  @Get()
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'List redirects' })
  findAll(@CurrentUser() user: any) {
    return this.redirectsService.findAll(user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Update a redirect' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRedirectDto,
    @CurrentUser() user: any,
  ) {
    return this.redirectsService.update(id, dto, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Delete a redirect' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.redirectsService.remove(id, user.organizationId);
  }

  @Get('not-found-logs')
  @RequirePermissions('articles:read')
  @ApiOperation({ summary: 'List 404 monitor entries' })
  listNotFoundLogs(@CurrentUser() user: any, @Query('resolved') resolved?: string) {
    return this.redirectsService.listNotFoundLogs(user.organizationId, resolved === 'true');
  }

  @Patch('not-found-logs/:id/dismiss')
  @RequirePermissions('articles:write')
  @ApiOperation({ summary: 'Mark a 404 monitor entry as resolved' })
  dismissNotFoundLog(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.redirectsService.dismissNotFoundLog(id, user.organizationId);
  }
}
