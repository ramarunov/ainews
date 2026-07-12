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

import { ThemesService } from './themes.service';
import { InstallThemeDto, UpdateThemeConfigDto } from './dto/theme.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Themes')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'themes', version: '1' })
export class ThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Post()
  @RequirePermissions('themes:write')
  @ApiOperation({ summary: 'Install a theme' })
  install(@Body() dto: InstallThemeDto, @CurrentUser() user: any) {
    return this.themesService.install(dto, user.organizationId);
  }

  @Get()
  @RequirePermissions('themes:read')
  @ApiOperation({ summary: 'List installed themes' })
  findAll(@CurrentUser() user: any) {
    return this.themesService.findAll(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('themes:read')
  @ApiOperation({ summary: 'Get a theme by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.themesService.findOne(id, user.organizationId);
  }

  @Patch(':id/activate')
  @RequirePermissions('themes:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a theme (deactivates all others in the organization)' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.themesService.activate(id, user.organizationId);
  }

  @Patch(':id/config')
  @RequirePermissions('themes:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update theme configuration' })
  updateConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateThemeConfigDto,
    @CurrentUser() user: any,
  ) {
    return this.themesService.updateConfig(id, dto.config, user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('themes:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Uninstall a theme' })
  uninstall(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.themesService.uninstall(id, user.organizationId);
  }
}
