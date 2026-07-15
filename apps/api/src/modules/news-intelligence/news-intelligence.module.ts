import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NewsIntelligenceService } from './news-intelligence.service';
import { NewsIntelligenceController } from './news-intelligence.controller';
import { NewsIngestionProcessor } from './news-ingestion.processor';
import { RssIngestionSchedulerService } from './rss-ingestion-scheduler.service';
import { NewsClusteringService } from './news-clustering.service';
import { ArticleExtractionService } from './article-extraction.service';
import { AutonomousPublishingService } from './autonomous-publishing.service';
import { AutonomousPublishingSchedulerService } from './autonomous-publishing-scheduler.service';
import { NEWS_INGESTION_QUEUE } from './news-intelligence.constants';
import { AIModule } from '../ai/ai.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SettingsModule } from '../settings/settings.module';
import { CategoriesModule } from '../categories/categories.module';
import { ArticlesModule } from '../articles/articles.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: NEWS_INGESTION_QUEUE }),
    AIModule,
    SystemSettingsModule,
    SettingsModule,
    CategoriesModule,
    ArticlesModule,
  ],
  providers: [
    NewsIntelligenceService,
    NewsIngestionProcessor,
    RssIngestionSchedulerService,
    NewsClusteringService,
    ArticleExtractionService,
    AutonomousPublishingService,
    AutonomousPublishingSchedulerService,
  ],
  controllers: [NewsIntelligenceController],
  exports: [NewsIntelligenceService],
})
export class NewsIntelligenceModule {}
