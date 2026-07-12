import { NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service';

describe('TagsService', () => {
  let service: TagsService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      tag: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      articleTag: {
        deleteMany: jest.fn(),
      },
    };
    // withOrgTransaction(this.prisma, cb) calls prisma.$transaction(cb) when
    // there's no active RLS org context (as in every unit test here, which
    // runs outside the request-scoped interceptor) — invoke the callback
    // with the same mock as `tx` so its own calls are observable below.
    prisma.$transaction = jest.fn((cb: any) => cb(prisma));
    eventEmitter = { emit: jest.fn() };
    service = new TagsService(prisma, eventEmitter);
  });

  describe('create', () => {
    it('slugifies the name and emits tag.created', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);
      const created = { id: 'tag-1', name: 'Artificial Intelligence', slug: 'artificial-intelligence' };
      prisma.tag.create.mockResolvedValue(created);

      const result = await service.create({ name: 'Artificial Intelligence' } as any, 'org-1');

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'artificial-intelligence' }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.created',
        expect.objectContaining({ tagId: 'tag-1' }),
      );
      expect(result).toBe(created);
    });
  });

  describe('update', () => {
    it('regenerates the slug only when the name actually changes', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue({ id: 'tag-1', name: 'Old', slug: 'old' } as any);
      prisma.tag.update.mockResolvedValue({});

      await service.update('tag-1', { description: 'just a description tweak' } as any, 'org-1');

      expect(prisma.tag.findFirst).not.toHaveBeenCalled(); // no slug regeneration attempted
      expect(prisma.tag.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'old' }) }),
      );
    });

    it('throws NotFoundException when the tag does not exist', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(
        service.update('missing', { name: 'x' } as any, 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('detaches the tag from articles and soft-deletes it in one transaction', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'tag-1' } as any);

      const result = await service.remove('tag-1', 'org-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.articleTag.deleteMany).toHaveBeenCalledWith({ where: { tagId: 'tag-1' } });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'tag.deleted',
        expect.objectContaining({ tagId: 'tag-1' }),
      );
      expect(result).toEqual({ success: true, message: 'Tag deleted' });
    });
  });

  describe('findOrCreateByNames', () => {
    it('returns an empty array for an empty or blank-only input', async () => {
      await expect(service.findOrCreateByNames([], 'org-1')).resolves.toEqual([]);
      await expect(service.findOrCreateByNames(['  ', ''], 'org-1')).resolves.toEqual([]);
      expect(prisma.tag.findMany).not.toHaveBeenCalled();
    });

    it('reuses an existing tag case-insensitively instead of creating a duplicate', async () => {
      prisma.tag.findMany.mockResolvedValue([{ id: 'tag-1', name: 'Robotics' }]);

      const result = await service.findOrCreateByNames(['robotics'], 'org-1');

      expect(prisma.tag.create).not.toHaveBeenCalled();
      expect(result).toEqual([{ id: 'tag-1', name: 'Robotics' }]);
    });

    it('creates only the names that do not already exist', async () => {
      prisma.tag.findMany.mockResolvedValue([{ id: 'tag-1', name: 'Robotics' }]);
      prisma.tag.findFirst.mockResolvedValue(null); // slug generation: no collisions
      prisma.tag.create.mockResolvedValue({ id: 'tag-2', name: 'Space' });

      const result = await service.findOrCreateByNames(['Robotics', 'Space'], 'org-1');

      expect(prisma.tag.create).toHaveBeenCalledTimes(1);
      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Space' }) }),
      );
      expect(result).toEqual([
        { id: 'tag-1', name: 'Robotics' },
        { id: 'tag-2', name: 'Space' },
      ]);
    });

    it('de-duplicates exact repeats but treats different casing as distinct names', async () => {
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.tag.findFirst.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue({ id: 'tag-1', name: 'AI' });

      await service.findOrCreateByNames(['AI', 'AI', 'ai'], 'org-1');

      // The pre-query dedup Set is case-sensitive, so 'AI' and 'ai' are two
      // distinct entries (only the exact repeat 'AI'/'AI' collapses) -- and
      // since findMany found neither in the DB, both get created.
      expect(prisma.tag.create).toHaveBeenCalledTimes(2);
    });
  });
});
