import { Controller, Post, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TranslationService } from './translation.service';

@ApiTags('Translation')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'translation', version: '1' })
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post('articles/:id')
  @RequirePermissions('articles:write')
  @ApiOperation({
    summary:
      'Create the English translation of an Indonesian article now (lands IN_REVIEW). Used for backfill and one-off retranslation.',
  })
  translateNow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.translationService.translateNow(id, user.organizationId);
  }

  @Post('approve-pending')
  @RequirePermissions('articles:publish')
  @ApiOperation({ summary: 'Publish every pending (IN_REVIEW) English translation in one action' })
  approvePending(@CurrentUser() user: any) {
    return this.translationService.approvePending(user.organizationId, user.id);
  }
}
