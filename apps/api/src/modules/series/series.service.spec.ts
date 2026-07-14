import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SeriesService } from './series.service';

describe('SeriesService', () => {
  let service: SeriesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      articleSeries: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      article: {
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new SeriesService(prisma);
  });

  describe('create', () => {
    it('slugifies the name and creates the series', async () => {
      prisma.articleSeries.findFirst.mockResolvedValue(null); // no slug collision
      const created = { id: 'series-1', name: 'The AI Files', slug: 'the-ai-files' };
      prisma.articleSeries.create.mockResolvedValue(created);

      const result = await service.create({ name: 'The AI Files' } as any, 'org-1');

      expect(prisma.articleSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-1', slug: 'the-ai-files' }),
        }),
      );
      expect(result).toBe(created);
    });

    it('appends a numeric suffix on a slug collision', async () => {
      prisma.articleSeries.findFirst
        .mockResolvedValueOnce({ id: 'existing' }) // "the-ai-files" taken
        .mockResolvedValueOnce(null); // "the-ai-files-1" free
      prisma.articleSeries.create.mockResolvedValue({ id: 'series-2' });

      await service.create({ name: 'The AI Files' } as any, 'org-1');

      expect(prisma.articleSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'the-ai-files-1' }) }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a series in another org', async () => {
      prisma.articleSeries.findFirst.mockResolvedValue(null);

      await expect(service.findOne('series-1', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('returns articles ordered by seriesOrder', async () => {
      const series = { id: 'series-1', slug: 'x', name: 'X', articles: [] };
      prisma.articleSeries.findFirst.mockResolvedValue(series);

      const result = await service.findOne('series-1', 'org-1');

      expect(prisma.articleSeries.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            articles: expect.objectContaining({
              orderBy: [{ seriesOrder: 'asc' }, { createdAt: 'asc' }],
            }),
          }),
        }),
      );
      expect(result).toBe(series);
    });
  });

  describe('remove', () => {
    it('rejects deleting a series that still has articles assigned', async () => {
      prisma.articleSeries.findFirst.mockResolvedValue({ id: 'series-1', slug: 'x', articles: [] });
      prisma.article.count.mockResolvedValue(3);

      await expect(service.remove('series-1', 'org-1')).rejects.toThrow(BadRequestException);
      expect(prisma.articleSeries.update).not.toHaveBeenCalled();
    });

    it('soft-deletes an empty series', async () => {
      prisma.articleSeries.findFirst.mockResolvedValue({ id: 'series-1', slug: 'x', articles: [] });
      prisma.article.count.mockResolvedValue(0);
      prisma.articleSeries.update.mockResolvedValue({});

      const result = await service.remove('series-1', 'org-1');

      expect(prisma.articleSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ success: true, message: 'Series deleted' });
    });
  });

  describe('assignArticle', () => {
    it('throws NotFoundException for an article outside the org', async () => {
      prisma.article.findFirst.mockResolvedValue(null);

      await expect(
        service.assignArticle('article-1', { seriesId: 'series-1' }, 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the target series does not exist in the org', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1', seriesOrder: null });
      prisma.articleSeries.findFirst.mockResolvedValue(null);

      await expect(
        service.assignArticle('article-1', { seriesId: 'missing-series' }, 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('assigns the article to a series with the given order', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1', seriesOrder: null });
      prisma.articleSeries.findFirst.mockResolvedValue({ id: 'series-1', articles: [] });
      prisma.article.update.mockResolvedValue({ id: 'article-1', seriesId: 'series-1', seriesOrder: 2 });

      await service.assignArticle('article-1', { seriesId: 'series-1', seriesOrder: 2 }, 'org-1');

      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: { seriesId: 'series-1', seriesOrder: 2 },
      });
    });

    it('clears both seriesId and seriesOrder when seriesId is set to null', async () => {
      prisma.article.findFirst.mockResolvedValue({ id: 'article-1', seriesOrder: 2 });
      prisma.article.update.mockResolvedValue({ id: 'article-1', seriesId: null, seriesOrder: null });

      await service.assignArticle('article-1', { seriesId: null }, 'org-1');

      expect(prisma.article.update).toHaveBeenCalledWith({
        where: { id: 'article-1' },
        data: { seriesId: null, seriesOrder: null },
      });
    });
  });
});
