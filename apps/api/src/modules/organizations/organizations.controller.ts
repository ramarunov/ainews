import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/organization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Organizations')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current organization' })
  getMe(@CurrentUser() user: any) {
    return this.organizationsService.findCurrent(user.organizationId);
  }

  @Patch('me')
  @RequirePermissions('organizations:write')
  @ApiOperation({ summary: 'Update current organization' })
  updateMe(@Body() dto: UpdateOrganizationDto, @CurrentUser() user: any) {
    return this.organizationsService.update(user.organizationId, dto);
  }

  @Get('me/roles')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List roles available in the current organization' })
  listRoles(@CurrentUser() user: any) {
    return this.organizationsService.listRoles(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('organizations:read')
  @ApiOperation({ summary: 'Get organization by ID (superadmin only for other orgs)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    if (!user.isSuperadmin && id !== user.organizationId) {
      throw new ForbiddenException(
        'You do not have permission to access this organization',
      );
    }

    return this.organizationsService.findOne(id);
  }
}
