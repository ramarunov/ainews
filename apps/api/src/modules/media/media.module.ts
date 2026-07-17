import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { StockPhotoService } from './stock-photo.service';
import { MediaController } from './media.controller';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AIModule } from '../ai/ai.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [StorageModule, AIModule, SystemSettingsModule],
  providers: [MediaService, StockPhotoService],
  controllers: [MediaController],
  exports: [MediaService, StockPhotoService],
})
export class MediaModule {}
