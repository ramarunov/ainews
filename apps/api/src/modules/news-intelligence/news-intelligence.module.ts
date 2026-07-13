import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NewsIntelligenceService } from './news-intelligence.service';
import { NewsIntelligenceController } from './news-intelligence.controller';
import { NewsIngestionProcessor } from './news-ingestion.processor';
import { RssIngestionSchedulerService } from './rss-ingestion-scheduler.service';
import { NEWS_INGESTION_QUEUE } from './news-intelligence.constants';

@Module({
  imports: [BullModule.registerQueue({ name: NEWS_INGESTION_QUEUE })],
  providers: [NewsIntelligenceService, NewsIngestionProcessor, RssIngestionSchedulerService],
  controllers: [NewsIntelligenceController],
  exports: [NewsIntelligenceService],
})
export class NewsIntelligenceModule {}
