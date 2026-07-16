import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperadminGuard } from '../../common/guards/superadmin.guard';

@ApiTags('Backups')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, SuperadminGuard)
@Controller({ path: 'backups', version: '1' })
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @ApiOperation({ summary: 'List database backups on disk (superadmin only)' })
  list() {
    return this.backupService.listBackups();
  }

  @Post('run')
  @Throttle({ default: { limit: 2, ttl: 3600000 } })
  @ApiOperation({ summary: 'Trigger an immediate database backup (superadmin only)' })
  run() {
    return this.backupService.runBackup();
  }
}
