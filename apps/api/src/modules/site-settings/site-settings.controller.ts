import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperadminGuard } from '../../common/guards/superadmin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SiteSettingsService } from './site-settings.service';
import {
  UpdateBrandingDto,
  UpdateCustomScriptsDto,
  UpdateFooterSettingDto,
  UpdateHomepageSeoDto,
  UpdateHomepageWidgetsDto,
} from './dto/site-settings.dto';

@ApiTags('Site Settings')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, SuperadminGuard)
@Controller({ path: 'site-settings', version: '1' })
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get('footer')
  @ApiOperation({ summary: 'Public site footer description/links (superadmin only)' })
  getFooter() {
    return this.siteSettingsService.getFooter();
  }

  @Put('footer')
  @ApiOperation({ summary: 'Set the public site footer description/links (superadmin only)' })
  updateFooter(@Body() dto: UpdateFooterSettingDto, @CurrentUser() user: any) {
    return this.siteSettingsService.updateFooter(dto, user.id);
  }

  @Get('homepage-widgets')
  @ApiOperation({ summary: 'Homepage sidebar widget configuration (superadmin only)' })
  getHomepageWidgets() {
    return this.siteSettingsService.getHomepageWidgets();
  }

  @Put('homepage-widgets')
  @ApiOperation({ summary: 'Set the homepage sidebar widget configuration (superadmin only)' })
  updateHomepageWidgets(@Body() dto: UpdateHomepageWidgetsDto, @CurrentUser() user: any) {
    return this.siteSettingsService.updateHomepageWidgets(dto, user.id);
  }

  @Get('homepage-seo')
  @ApiOperation({ summary: 'Homepage SEO meta tag overrides (superadmin only)' })
  getHomepageSeo() {
    return this.siteSettingsService.getHomepageSeo();
  }

  @Put('homepage-seo')
  @ApiOperation({ summary: 'Set homepage SEO meta tag overrides (superadmin only)' })
  updateHomepageSeo(@Body() dto: UpdateHomepageSeoDto, @CurrentUser() user: any) {
    return this.siteSettingsService.updateHomepageSeo(dto, user.id);
  }

  @Get('custom-scripts')
  @ApiOperation({ summary: 'Custom header/footer script injection (superadmin only)' })
  getCustomScripts() {
    return this.siteSettingsService.getCustomScripts();
  }

  @Put('custom-scripts')
  @ApiOperation({ summary: 'Set custom header/footer script injection (superadmin only)' })
  updateCustomScripts(@Body() dto: UpdateCustomScriptsDto, @CurrentUser() user: any) {
    return this.siteSettingsService.updateCustomScripts(dto, user.id);
  }

  @Get('branding')
  @ApiOperation({ summary: 'Logo and favicon URLs (superadmin only)' })
  getBranding() {
    return this.siteSettingsService.getBranding();
  }

  @Put('branding')
  @ApiOperation({ summary: 'Set the logo and favicon URLs (superadmin only)' })
  updateBranding(@Body() dto: UpdateBrandingDto, @CurrentUser() user: any) {
    return this.siteSettingsService.updateBranding(dto, user.id);
  }
}
