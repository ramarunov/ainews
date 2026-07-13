import { NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      organization: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findMany: jest.fn(),
      },
    };
    eventEmitter = { emit: jest.fn() };
    service = new OrganizationsService(prisma, eventEmitter);
  });

  describe('findOne', () => {
    it('throws NotFoundException for a missing or soft-deleted organization', async () => {
      prisma.organization.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the organization when found', async () => {
      const org = { id: 'org-1', name: 'Acme' };
      prisma.organization.findFirst.mockResolvedValue(org);

      await expect(service.findOne('org-1')).resolves.toBe(org);
    });
  });

  describe('findCurrent', () => {
    it('delegates to findOne', async () => {
      const org = { id: 'org-1' };
      prisma.organization.findFirst.mockResolvedValue(org);

      await expect(service.findCurrent('org-1')).resolves.toBe(org);
    });
  });

  describe('listRoles', () => {
    it('scopes the role list to this organization only', async () => {
      const roles = [{ id: 'role-1', name: 'Admin', slug: 'admin' }];
      prisma.role.findMany.mockResolvedValue(roles);

      const result = await service.listRoles('org-1');

      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result).toBe(roles);
    });
  });

  describe('update', () => {
    it('throws NotFoundException instead of updating a missing organization', async () => {
      prisma.organization.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'New Name' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields and emits organization.updated', async () => {
      prisma.organization.findFirst.mockResolvedValue({ id: 'org-1' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', name: 'New Name' });

      const result = await service.update('org-1', { name: 'New Name' } as any);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'New Name' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'organization.updated',
        expect.objectContaining({ organizationId: 'org-1' }),
      );
      expect(result).toEqual({ id: 'org-1', name: 'New Name' });
    });
  });
});
