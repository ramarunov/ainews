import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NewsIntelligenceService } from './news-intelligence.service';
import { NewsIntelligenceController } from './news-intelligence.controller';
import { NewsIngestionProcessor } from './news-ingestion.processor';
import { RssIngestionSchedulerService } from './rss-ingestion-scheduler.service';
import { NewsClusteringService } from './news-clustering.service';
import { NEWS_INGESTION_QUEUE } from './news-intelligence.constants';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [BullModule.registerQueue({ name: NEWS_INGESTION_QUEUE }), AIModule],
  providers: [
    NewsIntelligenceService,
    NewsIngestionProcessor,
    RssIngestionSchedulerService,
    NewsClusteringService,
  ],
  controllers: [NewsIntelligenceController],
  exports: [NewsIntelligenceService],
})
export class NewsIntelligenceModule {}
