import { SearchService } from './search.service';

describe('SearchService', () => {
  let service: SearchService;
  let opensearch: any;
  let prisma: any;
  let aiGateway: any;

  beforeEach(() => {
    opensearch = { search: jest.fn(), delete: jest.fn(), index: jest.fn() };
    prisma = {
      searchLog: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      article: { findMany: jest.fn(), count: jest.fn() },
      $queryRaw: jest.fn(),
    };
    aiGateway = { embed: jest.fn() };
    service = new SearchService(opensearch, prisma, aiGateway);
  });

  describe('search (analytics logging)', () => {
    it('logs the query and the real result count after a successful search', async () => {
      opensearch.search.mockResolvedValue({
        body: { hits: { total: { value: 2 }, hits: [{ _id: '1', _score: 1, _source: {} }, { _id: '2', _score: 1, _source: {} }] } },
      });

      await service.search('ai regulation', 'org-1', {}, 1, 20, 'user-1');
      // logging is fire-and-forget (not awaited internally) — flush microtasks
      await new Promise(process.nextTick);

      expect(prisma.searchLog.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', query: 'ai regulation', resultCount: 2, userId: 'user-1' },
      });
    });

    it('still resolves the search response even if analytics logging fails', async () => {
      opensearch.search.mockResolvedValue({
        body: { hits: { total: { value: 0 }, hits: [] } },
      });
      prisma.searchLog.create.mockRejectedValue(new Error('DB unavailable'));

      const result = await service.search('nonexistent', 'org-1', {}, 1, 20, 'user-1');

      expect(result.meta.total).toBe(0);
    });

    it('logs a zero result count when OpenSearch fails and the DB fallback also finds nothing', async () => {
      opensearch.search.mockRejectedValue(new Error('OpenSearch down'));
      prisma.article.findMany.mockResolvedValue([]);
      prisma.article.count.mockResolvedValue(0);

      await service.search('missing term', 'org-1', {}, 1, 20, 'user-1');
      await new Promise(process.nextTick);

      expect(prisma.searchLog.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', query: 'missing term', resultCount: 0, userId: 'user-1' },
      });
    });
  });

  describe('getAnalytics', () => {
    it('aggregates total searches, top queries, and zero-result queries', async () => {
      prisma.searchLog.count.mockResolvedValue(42);
      prisma.searchLog.groupBy
        .mockResolvedValueOnce([{ query: 'ai', _count: { query: 10 } }])
        .mockResolvedValueOnce([{ query: 'typo query', _count: { query: 3 } }]);

      const result = await service.getAnalytics('org-1', 30);

      expect(result.totalSearches).toBe(42);
      expect(result.topQueries).toEqual([{ query: 'ai', count: 10 }]);
      expect(result.zeroResultQueries).toEqual([{ query: 'typo query', count: 3 }]);

      // Second groupBy call (zero-result queries) must actually filter resultCount: 0.
      expect(prisma.searchLog.groupBy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ resultCount: 0 }),
        }),
      );
    });
  });

  describe('semanticSearch', () => {
    it('embeds the query text and orders results by cosine distance ascending', async () => {
      aiGateway.embed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3], model: 'text-embedding-3-large', usage: {} });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'a1', title: 'Closest match', slug: 'closest-match', excerpt: null, publishedAt: null, distance: 0.1 },
        { id: 'a2', title: 'Further match', slug: 'further-match', excerpt: null, publishedAt: null, distance: 0.4 },
      ]);

      const result = await service.semanticSearch('self-driving car regulation', 'org-1');

      expect(aiGateway.embed).toHaveBeenCalledWith('self-driving car regulation');
      expect(result).toEqual([
        { id: 'a1', title: 'Closest match', slug: 'closest-match', excerpt: null, publishedAt: null, similarity: 0.9 },
        { id: 'a2', title: 'Further match', slug: 'further-match', excerpt: null, publishedAt: null, similarity: 0.6 },
      ]);
    });

    it('clamps limit between 1 and 50', async () => {
      aiGateway.embed.mockResolvedValue({ embedding: [0.1], model: 'x', usage: {} });
      prisma.$queryRaw.mockResolvedValue([]);

      await service.semanticSearch('query', 'org-1', 500);

      // $queryRaw is invoked as a tagged template - a plain mock (not
      // Prisma's real Sql-wrapping) receives (stringsArray, ...values), in
      // the same order they're interpolated in the template: vectorLiteral,
      // organizationId, then take (the LIMIT clause) last.
      const call = prisma.$queryRaw.mock.calls[0];
      expect(call[call.length - 1]).toBe(50);
    });
  });
});
