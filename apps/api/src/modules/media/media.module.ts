import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [StorageModule, AIModule],
  providers: [MediaService],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
