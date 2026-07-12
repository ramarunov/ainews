/**
 * @jest-environment jsdom
 *
 * public-site.service.ts imports ArticlesService, which imports
 * isomorphic-dompurify — that package needs a real `window` (via jsdom)
 * even when unused by the code path under test here. See
 * articles.service.spec.ts for the same requirement and its own note.
 */
import { NotFoundException } from '@nestjs/common';
import { PublicSiteService } from './public-site.service';

describe('PublicSiteService', () => {
  let service: PublicSiteService;
  let articlesService: any;
  let config: any;

  beforeEach(() => {
    articlesService = {
      findAll: jest.fn(),
      findBySlug: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue('org-1') };
    service = new PublicSiteService(articlesService, config);
  });

  describe('listPublished', () => {
    it('throws NotFoundException when no public org is configured', async () => {
      config.get.mockReturnValue('');

      await expect(service.listPublished({})).rejects.toThrow(NotFoundException);
      expect(articlesService.findAll).not.toHaveBeenCalled();
    });

    it('always forces status=PUBLISHED regardless of what the caller asks for', async () => {
      articlesService.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.listPublished({ page: 2 } as any);

      expect(articlesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PUBLISHED', page: 2 }),
        'org-1',
      );
    });
  });

  describe('findPublishedBySlug', () => {
    it('throws NotFoundException for a draft article even though it exists', async () => {
      articlesService.findBySlug.mockResolvedValue({ id: 'a1', status: 'DRAFT', slug: 'x' });

      await expect(service.findPublishedBySlug('x')).rejects.toThrow(NotFoundException);
    });

    it('returns a published article', async () => {
      const article = { id: 'a1', status: 'PUBLISHED', slug: 'x' };
      articlesService.findBySlug.mockResolvedValue(article);

      await expect(service.findPublishedBySlug('x')).resolves.toBe(article);
      expect(articlesService.findBySlug).toHaveBeenCalledWith('x', 'org-1');
    });
  });
});
