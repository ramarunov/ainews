import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { ScheduledPublishSchedulerService } from './scheduled-publish-scheduler.service';
import { ArticleInternalLinkingService } from './article-internal-linking.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [NotificationsModule, AIModule],
  providers: [ArticlesService, ScheduledPublishSchedulerService, ArticleInternalLinkingService],
  controllers: [ArticlesController],
  exports: [ArticlesService],
})
export class ArticlesModule {}
