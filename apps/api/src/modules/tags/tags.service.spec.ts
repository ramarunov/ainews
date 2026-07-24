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

    it('picks a suffixed slug when the base is taken by a soft-deleted tag', async () => {
      // The DB unique constraint on (organizationId, slug) applies
      // regardless of deletedAt, so a slug "freed up" by a deleted tag is
      // still taken as far as Postgres is concerned - the collision check
      // must see soft-deleted rows too, or create() blows up with an
      // unhandled P2002 instead of just picking `-1`.
      prisma.tag.findFirst
        .mockResolvedValueOnce({ id: 'old-tag', slug: 'ai', deletedAt: new Date() })
        .mockResolvedValueOnce(null);
      const created = { id: 'tag-2', name: 'AI', slug: 'ai-1' };
      prisma.tag.create.mockResolvedValue(created);

      const result = await service.create({ name: 'AI' } as any, 'org-1');

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'ai-1' }) }),
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

    it('de-duplicates case-variant repeats down to one tag, keeping the first-seen casing', async () => {
      prisma.tag.findMany.mockResolvedValue([]);
      prisma.tag.findFirst.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue({ id: 'tag-1', name: 'AI' });

      await service.findOrCreateByNames(['AI', 'AI', 'ai'], 'org-1');

      // Previously the pre-query dedup was a case-sensitive Set, so 'AI'
      // and 'ai' survived as two distinct entries and both got created
      // (two tags for one name, slugs `ai`/`ai-1`) whenever neither existed
      // in the DB yet - e.g. the AI writer emitting both casings in one
      // batch. Dedup is now case-insensitive up front, so only one create
      // call happens, using whichever casing appeared first.
      expect(prisma.tag.create).toHaveBeenCalledTimes(1);
      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'AI' }) }),
      );
    });
  });
});
