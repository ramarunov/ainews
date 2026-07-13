import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Queue } from 'bull';
import { NewsSourceType } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { runWithOrgContext } from '../../infrastructure/prisma/org-context';
import { NEWS_INGESTION_QUEUE } from './news-intelligence.constants';
import { IngestSourceJobData } from './news-intelligence.service';

const INTERVAL_NAME = 'rss-ingestion-poll';

/**
 * Periodic RSS/Atom ingestion (NEWS-001) — previously 100% manual, someone
 * had to click "ingest" on every source. Every RSS_FETCH_INTERVAL_MINUTES,
 * enqueues an ingestion job for every active RSS/Atom source across every
 * organization.
 *
 * `Organization` has no RLS applied (no organizationId column on itself),
 * so listing every org is safe with no context. Listing each org's own
 * news sources deliberately goes through runWithOrgContext() per org
 * rather than bypassing RLS wholesale — this is a background system
 * process, not a superadmin request, and there's no reason for it to see
 * more than one tenant's sources at a time.
 */
@Injectable()
export class RssIngestionSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RssIngestionSchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(NEWS_INGESTION_QUEUE) private readonly ingestionQueue: Queue<IngestSourceJobData>,
  ) {}

  onModuleInit() {
    const minutes = this.config.get<number>('RSS_FETCH_INTERVAL_MINUTES', 15);
    const interval = setInterval(() => {
      this.enqueueAllActiveSources().catch((err) =>
        this.logger.error('Scheduled RSS ingestion sweep failed', err),
      );
    }, minutes * 60_000);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);
    this.logger.log(`Scheduled RSS ingestion every ${minutes} minute(s)`);
  }

  async enqueueAllActiveSources(): Promise<number> {
    const organizations = await this.prisma.organization.findMany({ select: { id: true } });

    let enqueued = 0;
    for (const org of organizations) {
      const sources = await runWithOrgContext(org.id, () =>
        this.prisma.newsSource.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            type: { in: [NewsSourceType.RSS, NewsSourceType.ATOM] },
          },
          select: { id: true },
        }),
      );

      for (const source of sources) {
        await this.ingestionQueue.add('ingest-source', {
          sourceId: source.id,
          organizationId: org.id,
        });
        enqueued++;
      }
    }

    if (enqueued > 0) {
      this.logger.log(`Enqueued ${enqueued} source(s) for ingestion`);
    }

    return enqueued;
  }
}
