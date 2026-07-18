import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getPublicSiteOrgId } from '../../common/config/public-site-org.util';
import { SettingsService } from '../settings/settings.service';
import { SITE_SETTING_KEYS } from './site-settings.constants';
import {
  UpdateBrandingDto,
  UpdateCustomScriptsDto,
  UpdateFooterSettingDto,
  UpdateHomepageSeoDto,
  UpdateHomepageWidgetsDto,
} from './dto/site-settings.dto';

@Injectable()
export class SiteSettingsService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
  ) {}

  private get orgId(): string {
    return getPublicSiteOrgId(this.config);
  }

  getFooter() {
    return this.settingsService.get(this.orgId, SITE_SETTING_KEYS.footer);
  }

  updateFooter(dto: UpdateFooterSettingDto, updatedBy: string) {
    return this.settingsService.set(this.orgId, SITE_SETTING_KEYS.footer, dto, updatedBy, true);
  }

  getHomepageWidgets() {
    return this.settingsService.get(this.orgId, SITE_SETTING_KEYS.homepageWidgets);
  }

  updateHomepageWidgets(dto: UpdateHomepageWidgetsDto, updatedBy: string) {
    return this.settingsService.set(
      this.orgId,
      SITE_SETTING_KEYS.homepageWidgets,
      dto,
      updatedBy,
      true,
    );
  }

  getHomepageSeo() {
    return this.settingsService.get(this.orgId, SITE_SETTING_KEYS.homepageSeo);
  }

  updateHomepageSeo(dto: UpdateHomepageSeoDto, updatedBy: string) {
    return this.settingsService.set(this.orgId, SITE_SETTING_KEYS.homepageSeo, dto, updatedBy, true);
  }

  getCustomScripts() {
    return this.settingsService.get(this.orgId, SITE_SETTING_KEYS.customScripts);
  }

  updateCustomScripts(dto: UpdateCustomScriptsDto, updatedBy: string) {
    return this.settingsService.set(
      this.orgId,
      SITE_SETTING_KEYS.customScripts,
      dto,
      updatedBy,
      true,
    );
  }

  getBranding() {
    return this.settingsService.get(this.orgId, SITE_SETTING_KEYS.branding);
  }

  updateBranding(dto: UpdateBrandingDto, updatedBy: string) {
    return this.settingsService.set(this.orgId, SITE_SETTING_KEYS.branding, dto, updatedBy, true);
  }
}
