import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ArticleStatus } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { runWithOrgContext } from '../../infrastructure/prisma/org-context';
import { ArticlesService } from './articles.service';

const INTERVAL_NAME = 'scheduled-publish-sweep';

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
  ) {}

  onModuleInit() {
    const minutes = this.config.get<number>('SCHEDULED_PUBLISH_INTERVAL_MINUTES', 1);
    const interval = setInterval(() => {
      this.publishDueArticles().catch((err) =>
        this.logger.error('Scheduled publish sweep failed', err),
      );
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
          select: { id: true, primaryAuthorId: true },
        }),
      );

      for (const article of dueArticles) {
        try {
          await runWithOrgContext(org.id, () =>
            this.articlesService.publish(article.id, article.primaryAuthorId, org.id),
          );
          published++;
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
