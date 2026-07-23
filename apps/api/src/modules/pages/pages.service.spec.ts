/**
 * @jest-environment jsdom
 *
 * pages.service.ts sanitizes content via common/sanitize-html.ts, which
 * uses isomorphic-dompurify - that package needs a real `window` (via
 * jsdom) even outside a browser, and jsdom itself needs TextEncoder/
 * TextDecoder polyfilled before import. See articles.service.spec.ts for
 * the same requirement in more depth.
 */
import { TextEncoder, TextDecoder } from 'node:util';

(global as any).TextEncoder = (global as any).TextEncoder || TextEncoder;
(global as any).TextDecoder = (global as any).TextDecoder || TextDecoder;

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PagesService } from './pages.service';

describe('PagesService', () => {
  let service: PagesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      page: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new PagesService(prisma);
  });

  describe('create', () => {
    it('slugifies the title and creates the page when no explicit slug is given', async () => {
      prisma.page.findFirst.mockResolvedValue(null); // no slug collision
      const created = { id: 'page-1', title: 'Privacy Policy', slug: 'privacy-policy' };
      prisma.page.create.mockResolvedValue(created);

      const result = await service.create({ title: 'Privacy Policy' } as any, 'org-1');

      expect(prisma.page.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'privacy-policy', isPublished: false }),
        }),
      );
      expect(result).toBe(created);
    });

    it('rejects a title/slug that slugifies to a reserved path', async () => {
      await expect(
        service.create({ title: 'Articles' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.page.create).not.toHaveBeenCalled();
    });

    it('rejects an explicit slug matching a reserved path even if the title does not', async () => {
      await expect(
        service.create({ title: 'My Custom Page', slug: 'pages' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.page.create).not.toHaveBeenCalled();
    });

    it('appends a numeric suffix on slug collision, same as categories', async () => {
      prisma.page.findFirst
        .mockResolvedValueOnce({ id: 'existing' }) // 'contact' taken
        .mockResolvedValueOnce(null); // 'contact-1' free
      prisma.page.create.mockResolvedValue({ id: 'page-2', slug: 'contact-1' });

      await service.create({ title: 'Contact' } as any, 'org-1');

      expect(prisma.page.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'contact-1' }) }),
      );
    });

    it('sanitizes content HTML before storing it', async () => {
      prisma.page.findFirst.mockResolvedValue(null);
      prisma.page.create.mockResolvedValue({ id: 'page-1' });

      await service.create(
        { title: 'About', content: '<p>Hi</p><script>alert(1)</script>' } as any,
        'org-1',
      );

      const data = prisma.page.create.mock.calls[0][0].data;
      expect(data.content).toBe('<p>Hi</p>');
    });
  });

  describe('findBySlug', () => {
    it('throws NotFoundException when no page matches', async () => {
      prisma.page.findFirst.mockResolvedValue(null);

      await expect(service.findBySlug('missing', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the matching page', async () => {
      const page = { id: 'page-1', slug: 'about' };
      prisma.page.findFirst.mockResolvedValue(page);

      await expect(service.findBySlug('about', 'org-1')).resolves.toBe(page);
    });
  });

  describe('update', () => {
    const existing = { id: 'page-1', title: 'About', slug: 'about', isPublished: false };

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);
      prisma.page.update.mockImplementation((args: any) =>
        Promise.resolve({ ...existing, ...args.data }),
      );
    });

    it('regenerates the slug when the title changes and no explicit slug is given', async () => {
      prisma.page.findFirst.mockResolvedValue(null);

      await service.update('page-1', { title: 'About Us' } as any, 'org-1');

      expect(prisma.page.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'about-us' }) }),
      );
    });

    it('leaves the slug untouched when only isPublished changes', async () => {
      await service.update('page-1', { isPublished: true } as any, 'org-1');

      expect(prisma.page.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'about', isPublished: true }) }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes the page', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'page-1' } as any);
      prisma.page.update.mockResolvedValue({});

      const result = await service.remove('page-1', 'org-1');

      expect(prisma.page.update).toHaveBeenCalledWith({
        where: { id: 'page-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ success: true, message: 'Page deleted' });
    });

    it('throws NotFoundException instead of deleting when the page does not exist', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.remove('missing', 'org-1')).rejects.toThrow(NotFoundException);
      expect(prisma.page.update).not.toHaveBeenCalled();
    });
  });
});
