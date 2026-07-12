import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { SystemSettingsService } from './system-settings.service';
import { UpdateAiProviderKeysDto } from './dto/system-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperadminGuard } from '../../common/guards/superadmin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('System Settings')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, SuperadminGuard)
@Controller({ path: 'system-settings', version: '1' })
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get('ai-providers')
  @ApiOperation({ summary: 'Which AI providers have a platform-wide key configured (superadmin only)' })
  getAiProviderStatus() {
    return this.systemSettingsService.getAiProviderStatus();
  }

  @Put('ai-providers')
  @ApiOperation({ summary: 'Set platform-wide AI provider API keys (superadmin only)' })
  updateAiProviderKeys(@Body() dto: UpdateAiProviderKeysDto, @CurrentUser() user: any) {
    return this.systemSettingsService.updateAiProviderKeys(dto, user.id);
  }
}
