import { Module } from '@nestjs/common';
import { TelegramNotificationService } from './telegram-notification.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  providers: [TelegramNotificationService],
})
export class TelegramModule {}
