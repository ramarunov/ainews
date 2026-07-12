import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { PluginsService } from './plugins.service';
import { InstallPluginDto, UpdatePluginConfigDto } from './dto/plugin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Plugins')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'plugins', version: '1' })
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Post()
  @RequirePermissions('plugins:write')
  @ApiOperation({ summary: 'Install a plugin' })
  install(@Body() dto: InstallPluginDto, @CurrentUser() user: any) {
    return this.pluginsService.install(dto, user.organizationId);
  }

  @Get()
  @RequirePermissions('plugins:read')
  @ApiOperation({ summary: 'List installed plugins' })
  findAll(@CurrentUser() user: any) {
    return this.pluginsService.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('plugins:read')
  @ApiOperation({ summary: 'Get a plugin by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.pluginsService.findOne(id, user.organizationId);
  }

  @Patch(':id/activate')
  @RequirePermissions('plugins:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a plugin' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.pluginsService.activate(id, user.organizationId);
  }

  @Patch(':id/deactivate')
  @RequirePermissions('plugins:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a plugin' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.pluginsService.deactivate(id, user.organizationId);
  }

  @Patch(':id/config')
  @RequirePermissions('plugins:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update plugin configuration' })
  updateConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePluginConfigDto,
    @CurrentUser() user: any,
  ) {
    return this.pluginsService.updateConfig(id, dto.config, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('plugins:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Uninstall a plugin' })
  uninstall(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.pluginsService.uninstall(id, user.organizationId);
  }
}
