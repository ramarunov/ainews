import { NewsIngestionProcessor } from './news-ingestion.processor';
import { orgContextStorage } from '../../infrastructure/prisma/org-context';

describe('NewsIngestionProcessor', () => {
  let processor: NewsIngestionProcessor;
  let newsIntelligenceService: any;

  beforeEach(() => {
    newsIntelligenceService = {
      ingestSource: jest.fn(),
    };
    processor = new NewsIngestionProcessor(newsIntelligenceService);
  });

  it('establishes the org context before calling ingestSource, so RLS-protected writes succeed', async () => {
    let contextDuringCall: unknown;
    newsIntelligenceService.ingestSource.mockImplementation(async () => {
      contextDuringCall = orgContextStorage.getStore();
      return { itemsFound: 2, itemsCreated: 1, itemsSkipped: 1 };
    });

    const job = { data: { sourceId: 'src-1', organizationId: 'org-1' } } as any;
    const result = await processor.handleIngestSource(job);

    expect(contextDuringCall).toEqual({ organizationId: 'org-1' });
    expect(newsIntelligenceService.ingestSource).toHaveBeenCalledWith('src-1', 'org-1');
    expect(result).toEqual({ itemsFound: 2, itemsCreated: 1, itemsSkipped: 1 });
  });

  it('propagates a failure from ingestSource without swallowing it', async () => {
    newsIntelligenceService.ingestSource.mockRejectedValue(new Error('feed unreachable'));

    const job = { data: { sourceId: 'src-1', organizationId: 'org-1' } } as any;

    await expect(processor.handleIngestSource(job)).rejects.toThrow('feed unreachable');
  });
});
