import { NotFoundException, BadRequestException } from '@nestjs/common';
import { NewsIntelligenceService } from './news-intelligence.service';

describe('NewsIntelligenceService', () => {
  let service: NewsIntelligenceService;
  let prisma: any;
  let eventEmitter: any;
  let queue: any;
  let clusteringService: any;

  beforeEach(() => {
    prisma = {
      newsSource: { findFirst: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };
    queue = { add: jest.fn() };
    clusteringService = { processItem: jest.fn().mockResolvedValue(undefined) };
    service = new NewsIntelligenceService(prisma, eventEmitter, clusteringService, queue);
  });

  describe('enqueueAndAwaitIngest', () => {
    it('throws NotFoundException immediately for a source outside this org, without touching the queue', async () => {
      prisma.newsSource.findFirst.mockResolvedValue(null);

      await expect(
        service.enqueueAndAwaitIngest('src-1', 'org-1'),
      ).rejects.toThrow(NotFoundException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('enqueues the job and returns whatever the processor resolves with', async () => {
      prisma.newsSource.findFirst.mockResolvedValue({ id: 'src-1', organizationId: 'org-1' });
      const jobResult = { itemsFound: 3, itemsCreated: 2, itemsSkipped: 1 };
      queue.add.mockResolvedValue({ finished: jest.fn().mockResolvedValue(jobResult) });

      const result = await service.enqueueAndAwaitIngest('src-1', 'org-1');

      expect(queue.add).toHaveBeenCalledWith('ingest-source', {
        sourceId: 'src-1',
        organizationId: 'org-1',
      });
      expect(result).toBe(jobResult);
    });

    it('re-wraps a job failure as BadRequestException, since class identity is lost through the queue', async () => {
      prisma.newsSource.findFirst.mockResolvedValue({ id: 'src-1', organizationId: 'org-1' });
      queue.add.mockResolvedValue({
        finished: jest.fn().mockRejectedValue(new Error('feed 500')),
      });

      await expect(service.enqueueAndAwaitIngest('src-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
