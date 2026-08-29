import { GeoService } from './geo.service';

describe('GeoService', () => {
  let service: GeoService;
  let prisma: any;
  let aiGateway: any;
  let aiWriter: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      article: { findUnique: jest.fn() },
      articleGeo: { upsert: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    aiGateway = { jsonPrompt: jest.fn(), embed: jest.fn() };
    aiWriter = { generateFAQs: jest.fn().mockResolvedValue([]) };
    eventEmitter = { emit: jest.fn() };
    service = new GeoService(prisma, aiGateway, aiWriter, eventEmitter);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateAndStoreEmbedding', () => {
    it('strips HTML before embedding and stores the result as a pgvector literal', async () => {
      aiGateway.embed.mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        model: 'text-embedding-3-large',
        usage: {},
      });

      await service.generateAndStoreEmbedding('article-1', 'My Title', '<p>Hello <b>world</b></p>');

      expect(aiGateway.embed).toHaveBeenCalledWith('My Title\n\nHello world');
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const call = prisma.$executeRaw.mock.calls[0];
      // Tagged-template mock: (stringsArray, vectorLiteral, articleId).
      expect(call[1]).toBe('[0.1,0.2,0.3]');
      expect(call[2]).toBe('article-1');
    });

    it('logs and swallows an embedding failure rather than throwing', async () => {
      aiGateway.embed.mockRejectedValue(new Error('AI provider down'));

      await expect(
        service.generateAndStoreEmbedding('article-1', 'Title', 'Content'),
      ).resolves.toBeUndefined();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('onArticlePublished', () => {
    it('does nothing when the article already has GEO data (only runs on first publish)', async () => {
      prisma.article.findUnique.mockResolvedValue({
        id: 'article-1',
        title: 'T',
        content: 'C',
        geoData: { id: 'geo-1' },
      });

      await service.onArticlePublished({ articleId: 'article-1' });

      expect(prisma.articleGeo.upsert).not.toHaveBeenCalled();
      expect(aiGateway.embed).not.toHaveBeenCalled();
    });

    it('calculates the GEO score, upserts it, then generates the embedding', async () => {
      prisma.article.findUnique.mockResolvedValue({
        id: 'article-1',
        title: 'AI Regulation News',
        content: '<p>Some real content about AI regulation.</p>',
        geoData: null,
      });
      aiGateway.jsonPrompt.mockResolvedValue({
        breakdown: {
          llmReadability: 10,
          semanticRichness: 10,
          entityCoverage: 10,
          evidence: 10,
          qaCoverage: 5,
          citationFriendliness: 2,
        },
        structuredSummary: 'summary',
        keyClaims: [],
        entitiesCovered: [],
        questionsAnswered: [],
        recommendations: [],
      });
      aiGateway.embed.mockResolvedValue({ embedding: [0.5], model: 'x', usage: {} });

      await service.onArticlePublished({ articleId: 'article-1' });

      expect(prisma.articleGeo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { articleId: 'article-1' } }),
      );
      expect(aiGateway.embed).toHaveBeenCalledWith(
        'AI Regulation News\n\nSome real content about AI regulation.',
      );
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('generates FAQs in the article language and stores them on article_geo', async () => {
      prisma.article.findUnique.mockResolvedValue({
        id: 'article-1',
        title: 'Gempa NTT',
        content: '<p>Isi artikel.</p>',
        language: 'id',
        geoData: null,
      });
      aiGateway.jsonPrompt.mockResolvedValue({ breakdown: {}, structuredSummary: 'ringkasan' });
      aiGateway.embed.mockResolvedValue({ embedding: [0.1], model: 'x', usage: {} });
      const faqs = [{ question: 'Apa yang terjadi?', answer: 'Gempa merusak fasilitas.' }];
      aiWriter.generateFAQs.mockResolvedValue(faqs);

      await service.onArticlePublished({ articleId: 'article-1' });

      expect(aiWriter.generateFAQs).toHaveBeenCalledWith('<p>Isi artikel.</p>', 5, 'id', 'article-1');
      const arg = prisma.articleGeo.upsert.mock.calls[0][0];
      expect(arg.create.faqItems).toEqual(faqs);
      expect(arg.update.faqItems).toEqual(faqs);
    });

    it('a failed FAQ pass leaves faqItems empty without losing the GEO upsert', async () => {
      prisma.article.findUnique.mockResolvedValue({ id: 'article-1', title: 'T', content: 'C', geoData: null });
      aiGateway.jsonPrompt.mockResolvedValue({ breakdown: {} });
      aiGateway.embed.mockResolvedValue({ embedding: [0.1], model: 'x', usage: {} });
      aiWriter.generateFAQs.mockRejectedValue(new Error('AI down'));

      await service.onArticlePublished({ articleId: 'article-1' });

      expect(prisma.articleGeo.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.articleGeo.upsert.mock.calls[0][0].create.faqItems).toEqual([]);
    });

    it('a failed embedding does not undo an already-successful GEO score upsert', async () => {
      prisma.article.findUnique.mockResolvedValue({
        id: 'article-1',
        title: 'T',
        content: 'C',
        geoData: null,
      });
      aiGateway.jsonPrompt.mockResolvedValue({
        breakdown: {
          llmReadability: 5,
          semanticRichness: 5,
          entityCoverage: 5,
          evidence: 5,
          qaCoverage: 5,
          citationFriendliness: 5,
        },
      });
      aiGateway.embed.mockRejectedValue(new Error('AI provider down'));

      await service.onArticlePublished({ articleId: 'article-1' });

      expect(prisma.articleGeo.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
