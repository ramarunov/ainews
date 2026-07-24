import { Module } from '@nestjs/common';
import { GoogleIndexingService } from './google-indexing.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  providers: [GoogleIndexingService],
})
export class GoogleIndexingModule {}
