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

// Ad Widgets (System Settings > "Ad Widgets") store raw HTML/script snippets
// under this prefix - the same script-injection risk as site.* settings, so
// they need the same superadmin-only write gate even though they've long
// been surfaced only in a superadmin-gated page: nothing previously stopped
// an org member with plain `settings:write` from writing to these keys
// directly through this generic endpoint.
const AD_WIDGET_KEY_PREFIX = 'ads.';

// Autonomous Publishing (AI Settings > "Autonomous Publishing") - same
// reasoning as AD_WIDGET_KEY_PREFIX above, but the stakes are higher than
// script injection: since AUTONOMOUS_PIPELINE_SETTINGS.autoPublishConfidenceThreshold
// was added, a write to this prefix can make the pipeline publish AI-drafted
// articles with zero human review. The dedicated UI (AI Settings) has always
// been superadmin-gated; this closes the same "generic endpoint bypasses the
// gate" hole for the whole autonomous-pipeline settings family, not just the
// new key.
const AUTONOMOUS_PIPELINE_KEY_PREFIX = 'news.autonomous_pipeline.';

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
    return this.settingsService.set(user.organizationId, key, dto.value, user.id, dto.isPublic);
  }

  @Delete(':key')
  @RequirePermissions('settings:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a setting' })
  remove(@Param('key') key: string, @CurrentUser() user: any) {
    this.assertNotSuperadminOnlyKey(key, user);
    return this.settingsService.remove(user.organizationId, key);
  }

  // `site.*` (Site Settings) and `ads.*` (Ad Widgets) keys both back
  // superadmin-only UI and both allow raw script injection - they must stay
  // writable ONLY by a superadmin, never through this generic
  // org-permission-gated endpoint, or any org member holding the ordinary
  // `settings:write` permission could inject scripts/content into the
  // public site despite the dedicated UI being superadmin-only.
  private assertNotSuperadminOnlyKey(key: string, user: any) {
    const isSuperadminOnlyKey =
      key.startsWith(SITE_SETTING_KEY_PREFIX) ||
      key.startsWith(AD_WIDGET_KEY_PREFIX) ||
      key.startsWith(AUTONOMOUS_PIPELINE_KEY_PREFIX);
    if (isSuperadminOnlyKey && !user.isSuperadmin) {
      throw new ForbiddenException('Superadmin access required for this setting');
    }
  }
}
