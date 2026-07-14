import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { ScheduledPublishSchedulerService } from './scheduled-publish-scheduler.service';

@Module({
  providers: [ArticlesService, ScheduledPublishSchedulerService],
  controllers: [ArticlesController],
  exports: [ArticlesService],
})
export class ArticlesModule {}
