import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('API Keys')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @RequirePermissions('settings:read')
  @ApiOperation({ summary: "List the organization's API keys (never returns the plaintext key again)" })
  findAll(@CurrentUser() user: any) {
    return this.apiKeysService.findAll(user.organizationId);
  }

  @Post()
  @RequirePermissions('settings:write')
  @ApiOperation({ summary: 'Create a new API key - the plaintext key is only ever shown in this response' })
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: any) {
    return this.apiKeysService.create(dto, user.id, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('settings:write')
  @ApiOperation({ summary: 'Revoke an API key permanently' })
  async revoke(@Param('id') id: string, @CurrentUser() user: any) {
    await this.apiKeysService.revoke(id, user.organizationId);
    return { revoked: true };
  }
}
