import { NewsClusteringService } from './news-clustering.service';

describe('NewsClusteringService', () => {
  let service: NewsClusteringService;
  let prisma: any;
  let aiWriter: any;

  beforeEach(() => {
    prisma = {
      newsItem: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      newsCluster: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'cluster-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    aiWriter = { extractEntities: jest.fn().mockResolvedValue([]) };
    service = new NewsClusteringService(prisma, aiWriter);
  });

  describe('processItem', () => {
    it('does nothing when the item does not exist in this org', async () => {
      prisma.newsItem.findFirst.mockResolvedValue(null);

      await service.processItem('missing-item', 'org-1');

      expect(aiWriter.extractEntities).not.toHaveBeenCalled();
      expect(prisma.newsCluster.create).not.toHaveBeenCalled();
    });

    it('creates a new cluster when no existing cluster is similar enough', async () => {
      prisma.newsItem.findFirst.mockResolvedValue({
        id: 'item-1',
        title: 'Central bank raises interest rates again',
        content: 'The central bank announced a rate hike today.',
        excerpt: null,
      });
      aiWriter.extractEntities.mockResolvedValue([
        { text: 'Federal Reserve', type: 'ORGANIZATION', confidence: 0.9 },
      ]);
      prisma.newsCluster.findMany.mockResolvedValue([]);

      await service.processItem('item-1', 'org-1');

      expect(prisma.newsCluster.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            title: 'Central bank raises interest rates again',
            itemCount: 1,
          }),
        }),
      );
      expect(prisma.newsItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({ clusterId: 'cluster-new' }),
      });
    });

    it('joins an existing cluster when entities and title overlap enough', async () => {
      prisma.newsItem.findFirst.mockResolvedValue({
        id: 'item-2',
        title: 'Federal Reserve raises interest rates sharply',
        content: 'Coverage of the Federal Reserve decision.',
        excerpt: null,
      });
      aiWriter.extractEntities.mockResolvedValue([
        { text: 'Federal Reserve', type: 'ORGANIZATION', confidence: 0.9 },
      ]);
      prisma.newsCluster.findMany.mockResolvedValue([
        {
          id: 'cluster-1',
          title: 'Federal Reserve raises interest rates again',
          entities: [{ text: 'Federal Reserve', type: 'ORGANIZATION', confidence: 0.9 }],
          lastUpdatedAt: new Date(),
        },
      ]);

      await service.processItem('item-2', 'org-1');

      expect(prisma.newsCluster.create).not.toHaveBeenCalled();
      expect(prisma.newsCluster.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cluster-1' },
          data: expect.objectContaining({ itemCount: { increment: 1 } }),
        }),
      );
      expect(prisma.newsItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: expect.objectContaining({ clusterId: 'cluster-1' }),
      });
    });

    it('does not join a cluster about a completely different story', async () => {
      prisma.newsItem.findFirst.mockResolvedValue({
        id: 'item-3',
        title: 'Local sports team wins championship',
        content: 'The home team clinched the title last night.',
        excerpt: null,
      });
      aiWriter.extractEntities.mockResolvedValue([
        { text: 'City Warriors', type: 'ORGANIZATION', confidence: 0.8 },
      ]);
      prisma.newsCluster.findMany.mockResolvedValue([
        {
          id: 'cluster-unrelated',
          title: 'Federal Reserve raises interest rates again',
          entities: [{ text: 'Federal Reserve', type: 'ORGANIZATION', confidence: 0.9 }],
          lastUpdatedAt: new Date(),
        },
      ]);

      await service.processItem('item-3', 'org-1');

      expect(prisma.newsCluster.update).not.toHaveBeenCalled();
      expect(prisma.newsCluster.create).toHaveBeenCalled();
    });

    it('joins a cluster via title overlap alone when neither side has entities, even with a paraphrased (not identical) title', async () => {
      // Regression test: an earlier version of this scoring always
      // multiplied the title score by TITLE_WEIGHT (0.4), which meant even
      // a strongly-overlapping-but-not-identical title (~0.7 raw jaccard,
      // e.g. two outlets paraphrasing the same headline) could never clear
      // the 0.3 threshold once weighted down to ~0.28 - verified against a
      // live ingest before this fix. When there's no entity signal at all,
      // title similarity must be judged on its own 0-1 scale.
      prisma.newsItem.findFirst.mockResolvedValue({
        id: 'item-5',
        title: 'OpenAI announces new GPT model with major performance gains',
        content: 'Some coverage.',
        excerpt: null,
      });
      prisma.newsCluster.findMany.mockResolvedValue([
        {
          id: 'cluster-paraphrased-match',
          title: 'OpenAI unveils new GPT model boasting major performance gains',
          entities: [],
          lastUpdatedAt: new Date(),
        },
      ]);

      await service.processItem('item-5', 'org-1');

      expect(prisma.newsCluster.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cluster-paraphrased-match' } }),
      );
      expect(prisma.newsCluster.create).not.toHaveBeenCalled();
    });

    it('falls back to title-only similarity when entity extraction fails', async () => {
      prisma.newsItem.findFirst.mockResolvedValue({
        id: 'item-4',
        title: 'Central bank raises interest rates again',
        content: 'Some coverage.',
        excerpt: null,
      });
      aiWriter.extractEntities.mockRejectedValue(new Error('AI provider unavailable'));
      prisma.newsCluster.findMany.mockResolvedValue([
        {
          id: 'cluster-title-match',
          title: 'Central bank raises interest rates again',
          entities: [],
          lastUpdatedAt: new Date(),
        },
      ]);

      await expect(service.processItem('item-4', 'org-1')).resolves.toBeUndefined();

      // Still joins a cluster via title-token overlap alone, and never
      // throws just because the AI call failed.
      expect(prisma.newsCluster.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cluster-title-match' } }),
      );
    });
  });
});
