import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { runWithOrgContext } from '../../infrastructure/prisma/org-context';
import { NewsIntelligenceService, IngestSourceJobData } from './news-intelligence.service';
import { NEWS_INGESTION_QUEUE } from './news-intelligence.constants';

@Processor(NEWS_INGESTION_QUEUE)
export class NewsIngestionProcessor {
  private readonly logger = new Logger(NewsIngestionProcessor.name);

  constructor(private readonly newsIntelligenceService: NewsIntelligenceService) {}

  @Process('ingest-source')
  async handleIngestSource(job: Job<IngestSourceJobData>) {
    const { sourceId, organizationId } = job.data;

    // This runs outside any HTTP request, so there's no
    // OrgContextInterceptor to establish the RLS context — the queue is a
    // background worker, not a request handler. Without this, every write
    // ingestSource() makes to news_items (RLS-protected) would be denied.
    return runWithOrgContext(organizationId, async () => {
      const result = await this.newsIntelligenceService.ingestSource(sourceId, organizationId);
      this.logger.log(
        `Ingested source ${sourceId}: ${result.itemsCreated} created, ${result.itemsSkipped} skipped, ${result.itemsFound} found`,
      );
      return result;
    });
  }
}
