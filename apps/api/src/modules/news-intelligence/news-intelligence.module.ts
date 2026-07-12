import { Module } from '@nestjs/common';
import { NewsIntelligenceService } from './news-intelligence.service';
import { NewsIntelligenceController } from './news-intelligence.controller';

@Module({
  providers: [NewsIntelligenceService],
  controllers: [NewsIntelligenceController],
  exports: [NewsIntelligenceService],
})
export class NewsIntelligenceModule {}
