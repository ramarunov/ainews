import { RssIngestionSchedulerService } from './rss-ingestion-scheduler.service';

describe('RssIngestionSchedulerService', () => {
  let service: RssIngestionSchedulerService;
  let prisma: any;
  let queue: any;
  let schedulerRegistry: any;
  let config: any;

  beforeEach(() => {
    prisma = {
      organization: { findMany: jest.fn() },
      newsSource: { findMany: jest.fn() },
    };
    queue = { add: jest.fn() };
    schedulerRegistry = { addInterval: jest.fn() };
    config = { get: jest.fn((_key: string, fallback: any) => fallback) };
    service = new RssIngestionSchedulerService(schedulerRegistry, config, prisma, queue);
  });

  describe('onModuleInit', () => {
    it('registers a named interval with the scheduler registry', () => {
      service.onModuleInit();

      expect(schedulerRegistry.addInterval).toHaveBeenCalledWith(
        'rss-ingestion-poll',
        expect.anything(),
      );

      // Real setInterval — clear it so it doesn't keep the test worker alive.
      clearInterval(schedulerRegistry.addInterval.mock.calls[0][1]);
    });
  });

  describe('enqueueAllActiveSources', () => {
    it('enqueues one job per active RSS/Atom source, scoped per organization', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
      prisma.newsSource.findMany
        .mockResolvedValueOnce([{ id: 'src-1' }, { id: 'src-2' }])
        .mockResolvedValueOnce([{ id: 'src-3' }]);

      const enqueued = await service.enqueueAllActiveSources();

      expect(enqueued).toBe(3);
      expect(queue.add).toHaveBeenCalledWith('ingest-source', {
        sourceId: 'src-1',
        organizationId: 'org-1',
      });
      expect(queue.add).toHaveBeenCalledWith('ingest-source', {
        sourceId: 'src-2',
        organizationId: 'org-1',
      });
      expect(queue.add).toHaveBeenCalledWith('ingest-source', {
        sourceId: 'src-3',
        organizationId: 'org-2',
      });
    });

    it('only queries active, non-deleted RSS/Atom sources', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.newsSource.findMany.mockResolvedValue([]);

      await service.enqueueAllActiveSources();

      expect(prisma.newsSource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true, deletedAt: null }),
        }),
      );
    });

    it('enqueues nothing and returns 0 when there are no active sources anywhere', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
      prisma.newsSource.findMany.mockResolvedValue([]);

      const enqueued = await service.enqueueAllActiveSources();

      expect(enqueued).toBe(0);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
