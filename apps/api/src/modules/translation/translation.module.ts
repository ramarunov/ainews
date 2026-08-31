import { Module } from '@nestjs/common';

import { AIModule } from '../ai/ai.module';
import { ArticlesModule } from '../articles/articles.module';
import { SettingsModule } from '../settings/settings.module';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';

@Module({
  imports: [AIModule, ArticlesModule, SettingsModule],
  providers: [TranslationService],
  controllers: [TranslationController],
  exports: [TranslationService],
})
export class TranslationModule {}
