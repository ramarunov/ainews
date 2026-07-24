import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      category: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      article: {
        count: jest.fn(),
      },
    };
    eventEmitter = { emit: jest.fn() };
    service = new CategoriesService(prisma, eventEmitter);
  });

  describe('create', () => {
    it('rejects a non-existent parentId', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Sub', parentId: 'missing-parent' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('slugifies the name and creates the category, emitting category.created', async () => {
      prisma.category.findFirst.mockResolvedValue(null); // no slug collision
      const created = { id: 'cat-1', name: 'World News', slug: 'world-news' };
      prisma.category.create.mockResolvedValue(created);

      const result = await service.create({ name: 'World News' } as any, 'org-1');

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'world-news' }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'category.created',
        expect.objectContaining({ categoryId: 'cat-1' }),
      );
      expect(result).toBe(created);
    });

    it('picks a suffixed slug when the base is taken by a soft-deleted category', async () => {
      // The DB unique constraint on (organizationId, slug) applies
      // regardless of deletedAt, so a slug "freed up" by a deleted category
      // is still taken as far as Postgres is concerned - the collision
      // check must see soft-deleted rows too, or create() blows up with an
      // unhandled P2002 instead of just picking `-1`.
      prisma.category.findFirst
        .mockResolvedValueOnce({ id: 'old-cat', slug: 'golf', deletedAt: new Date() })
        .mockResolvedValueOnce(null);
      const created = { id: 'cat-2', name: 'Golf', slug: 'golf-1' };
      prisma.category.create.mockResolvedValue(created);

      const result = await service.create({ name: 'Golf' } as any, 'org-1');

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'golf-1' }) }),
      );
      expect(result).toBe(created);
    });
  });

  describe('update', () => {
    const existing = { id: 'cat-1', name: 'Old Name', slug: 'old-name' };

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);
      prisma.category.update.mockImplementation((args: any) =>
        Promise.resolve({ ...existing, ...args.data }),
      );
    });

    it('rejects setting a category as its own parent', async () => {
      await expect(
        service.update('cat-1', { parentId: 'cat-1' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a parent change that would create a cycle', async () => {
      // cat-1's proposed new parent is cat-2, but cat-2's parent chain leads back to cat-1
      prisma.category.findFirst.mockImplementation((args: any) => {
        if (args.where.id === 'cat-2' && args.select) {
          return Promise.resolve({ parentId: 'cat-1' }); // cat-2's parent is cat-1 -> cycle
        }
        if (args.where.id === 'cat-2') {
          return Promise.resolve({ id: 'cat-2' }); // parent-exists check
        }
        return Promise.resolve(null);
      });

      await expect(
        service.update('cat-1', { parentId: 'cat-2' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a valid parent change with no cycle', async () => {
      prisma.category.findFirst.mockImplementation((args: any) => {
        if (args.where.id === 'cat-2' && args.select) {
          return Promise.resolve({ parentId: null }); // cat-2 is a root, no cycle back to cat-1
        }
        if (args.where.id === 'cat-2') {
          return Promise.resolve({ id: 'cat-2' });
        }
        return Promise.resolve(null);
      });

      await expect(
        service.update('cat-1', { parentId: 'cat-2' } as any, 'org-1'),
      ).resolves.toEqual(expect.objectContaining({ parentId: 'cat-2' }));
    });

    it('regenerates the slug when the name changes and no explicit slug is given', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await service.update('cat-1', { name: 'Brand New Name' } as any, 'org-1');

      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'brand-new-name' }),
        }),
      );
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cat-1' } as any);
    });

    it('refuses to delete a category that still has active subcategories', async () => {
      prisma.category.count.mockResolvedValue(2);

      await expect(service.remove('cat-1', 'org-1')).rejects.toThrow(BadRequestException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('refuses to delete a category still used as a primary category on articles', async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.article.count.mockResolvedValue(3);

      await expect(service.remove('cat-1', 'org-1')).rejects.toThrow(BadRequestException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('soft-deletes when there are no children and no articles using it', async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.article.count.mockResolvedValue(0);
      prisma.category.update.mockResolvedValue({});

      const result = await service.remove('cat-1', 'org-1');

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'category.deleted',
        expect.objectContaining({ categoryId: 'cat-1' }),
      );
      expect(result).toEqual({ success: true, message: 'Category deleted' });
    });

    it('throws NotFoundException instead of deleting when the category does not exist', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.remove('missing', 'org-1')).rejects.toThrow(NotFoundException);
      expect(prisma.category.count).not.toHaveBeenCalled();
    });
  });

  describe('resolveByHint', () => {
    it('returns null without querying when the hint is null/undefined/empty', async () => {
      expect(await service.resolveByHint(null, 'org-1')).toBeNull();
      expect(await service.resolveByHint(undefined, 'org-1')).toBeNull();
      expect(await service.resolveByHint('', 'org-1')).toBeNull();
      expect(prisma.category.findFirst).not.toHaveBeenCalled();
    });

    it('slugifies the hint and resolves to the matching category id', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-politik', slug: 'politik' });

      const result = await service.resolveByHint('Politik', 'org-1');

      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ slug: 'politik', organizationId: 'org-1' }) }),
      );
      expect(result).toBe('cat-politik');
    });

    it('returns null (not a thrown error) when no category matches the hint', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      const result = await service.resolveByHint('some-old-renamed-category', 'org-1');

      expect(result).toBeNull();
    });
  });

  describe('subdomain', () => {
    it('rejects a reserved subdomain on create', async () => {
      await expect(
        service.create({ name: 'App News', subdomain: 'app' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('rejects a subdomain already used by another category in the same org', async () => {
      // generateSlug's collision check (where.slug) finds nothing; the
      // subsequent assertSubdomainAvailable check (where.subdomain) does.
      prisma.category.findFirst.mockImplementation((args: any) =>
        Promise.resolve(args.where?.subdomain ? { id: 'cat-existing' } : null),
      );

      await expect(
        service.create({ name: 'Kesehatan', subdomain: 'kesehatan' } as any, 'org-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('creates a category with a unique, non-reserved subdomain', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      const created = { id: 'cat-1', name: 'Kesehatan', slug: 'kesehatan', subdomain: 'kesehatan' };
      prisma.category.create.mockResolvedValue(created);

      const result = await service.create(
        { name: 'Kesehatan', subdomain: 'kesehatan' } as any,
        'org-1',
      );

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subdomain: 'kesehatan' }) }),
      );
      expect(result).toBe(created);
    });

    describe('update', () => {
      it('rejects assigning a reserved subdomain', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cat-1', subdomain: null } as any);

        await expect(
          service.update('cat-1', { subdomain: 'api' } as any, 'org-1'),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.category.update).not.toHaveBeenCalled();
      });

      it('rejects assigning a subdomain already used by another category', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cat-1', subdomain: null } as any);
        prisma.category.findFirst.mockResolvedValue({ id: 'other-cat' });

        await expect(
          service.update('cat-1', { subdomain: 'teknologi' } as any, 'org-1'),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.category.update).not.toHaveBeenCalled();
      });

      it('clears the subdomain to null when an empty string is submitted', async () => {
        jest
          .spyOn(service, 'findOne')
          .mockResolvedValue({ id: 'cat-1', subdomain: 'kesehatan' } as any);
        prisma.category.update.mockResolvedValue({});

        await service.update('cat-1', { subdomain: '' } as any, 'org-1');

        expect(prisma.category.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ subdomain: null }) }),
        );
      });

      it('leaves the subdomain untouched when the field is omitted from the update', async () => {
        jest
          .spyOn(service, 'findOne')
          .mockResolvedValue({ id: 'cat-1', name: 'Kesehatan', subdomain: 'kesehatan' } as any);
        prisma.category.findFirst.mockResolvedValue(null);
        prisma.category.update.mockResolvedValue({});

        await service.update('cat-1', { name: 'Kesehatan Update' } as any, 'org-1');

        const data = prisma.category.update.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('subdomain');
      });

      it('allows re-saving the same subdomain the category already has', async () => {
        jest
          .spyOn(service, 'findOne')
          .mockResolvedValue({ id: 'cat-1', subdomain: 'kesehatan' } as any);
        prisma.category.update.mockResolvedValue({});

        await service.update('cat-1', { subdomain: 'kesehatan' } as any, 'org-1');

        // No availability check needed since it's unchanged - the update
        // should go straight through without a findFirst collision lookup.
        expect(prisma.category.findFirst).not.toHaveBeenCalled();
        expect(prisma.category.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ subdomain: 'kesehatan' }) }),
        );
      });
    });
  });
});
