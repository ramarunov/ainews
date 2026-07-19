import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { ArticleStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { runWithOrgContext } from '../../infrastructure/prisma/org-context';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { runWithSchedulerLock } from '../../common/scheduler-lock.util';
import { ArticlesService } from './articles.service';
import { NotificationsService } from '../notifications/notifications.service';

const INTERVAL_NAME = 'scheduled-publish-sweep';
const LOCK_KEY = 'scheduler-lock:scheduled-publish-sweep';
// publish() itself only touches the DB (internal-linking/notifications are
// both fire-and-forget, not awaited), so a normal sweep finishes in well
// under this - it's only a crash safety-net (see runWithSchedulerLock),
// long enough to comfortably outlast even a slow run across many orgs.
const LOCK_TTL_SECONDS = 300;

/**
 * Auto-publish sweep (ART-004) — until this existed, `scheduledAt` was
 * purely decorative: the field was stored on create/update but nothing
 * ever flipped a SCHEDULED article to PUBLISHED once its time arrived.
 * Same periodic-sweep-across-orgs shape as RssIngestionSchedulerService.
 */
@Injectable()
export class ScheduledPublishSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledPublishSchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly articlesService: ArticlesService,
    private readonly notificationsService: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    const minutes = this.config.get<number>('SCHEDULED_PUBLISH_INTERVAL_MINUTES', 1);
    const interval = setInterval(() => {
      runWithSchedulerLock(this.redis, LOCK_KEY, LOCK_TTL_SECONDS, () =>
        this.publishDueArticles(),
      ).catch((err) => this.logger.error('Scheduled publish sweep failed', err));
    }, minutes * 60_000);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);
    this.logger.log(`Scheduled auto-publish sweep every ${minutes} minute(s)`);
  }

  async publishDueArticles(): Promise<number> {
    const now = new Date();
    const organizations = await this.prisma.organization.findMany({ select: { id: true } });

    let published = 0;
    for (const org of organizations) {
      const dueArticles = await runWithOrgContext(org.id, () =>
        this.prisma.article.findMany({
          where: {
            organizationId: org.id,
            status: ArticleStatus.SCHEDULED,
            scheduledAt: { lte: now },
            deletedAt: null,
          },
          select: { id: true, title: true, primaryAuthorId: true },
        }),
      );

      for (const article of dueArticles) {
        try {
          await runWithOrgContext(org.id, () =>
            this.articlesService.publish(article.id, article.primaryAuthorId, org.id),
          );
          published++;
          this.notificationsService
            .create(
              article.primaryAuthorId,
              'scheduled_article_published',
              `Your scheduled article is now live: ${article.title}`,
              undefined,
              { articleId: article.id },
            )
            .catch((err) =>
              this.logger.error(`Failed to notify ${article.primaryAuthorId} about article ${article.id}`, err),
            );
        } catch (err) {
          this.logger.error(`Failed to auto-publish article ${article.id}`, err);
        }
      }
    }

    if (published > 0) {
      this.logger.log(`Auto-published ${published} scheduled article(s)`);
    }

    return published;
  }
}
