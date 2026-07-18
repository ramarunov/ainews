import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';

import { SettingsService } from './settings.service';
import { SetSettingDto } from './dto/setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SITE_SETTING_KEY_PREFIX } from '../site-settings/site-settings.constants';

@ApiTags('Settings')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions('settings:read')
  @ApiOperation({ summary: 'List settings for the current organization' })
  list(@CurrentUser() user: any) {
    return this.settingsService.list(user.organizationId);
  }

  @Get(':key')
  @RequirePermissions('settings:read')
  @ApiOperation({ summary: 'Get a setting by key' })
  async get(@Param('key') key: string, @CurrentUser() user: any, @Res() res: Response) {
    // A Setting's JSON value can be a bare string/number/boolean/null - Nest's
    // default response handling calls Express's res.send() for non-object
    // return values, which sends primitives unquoted as text/html instead of
    // valid JSON (booleans/numbers happen to still parse; strings don't).
    // res.json() always encodes correctly regardless of the value's type.
    const value = await this.settingsService.get(user.organizationId, key);
    res.json(value);
  }

  @Put(':key')
  @RequirePermissions('settings:write')
  @ApiOperation({ summary: 'Create or update a setting' })
  set(@Param('key') key: string, @Body() dto: SetSettingDto, @CurrentUser() user: any) {
    this.assertNotSuperadminOnlyKey(key, user);
    return this.settingsService.set(
      user.organizationId,
      key,
      dto.value,
      user.id,
      dto.isPublic ?? false,
    );
  }

  @Delete(':key')
  @RequirePermissions('settings:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a setting' })
  remove(@Param('key') key: string, @CurrentUser() user: any) {
    this.assertNotSuperadminOnlyKey(key, user);
    return this.settingsService.remove(user.organizationId, key);
  }

  // `site.*` keys back the superadmin-only Site Settings feature
  // (see modules/site-settings) - they must stay writable ONLY through that
  // feature's own SuperadminGuard-gated controller, never through this
  // generic org-permission-gated endpoint, or any org member holding the
  // ordinary `settings:write` permission could inject scripts/content into
  // the public site despite the dedicated UI being superadmin-only.
  private assertNotSuperadminOnlyKey(key: string, user: any) {
    if (key.startsWith(SITE_SETTING_KEY_PREFIX) && !user.isSuperadmin) {
      throw new ForbiddenException('Superadmin access required for this setting');
    }
  }
}
