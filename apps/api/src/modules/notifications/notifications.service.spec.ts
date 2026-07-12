import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new NotificationsService(prisma);
  });

  describe('create', () => {
    it('defaults data to an empty object when omitted', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n1' });

      await service.create('user-1', 'article.published', 'Article published');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1', data: {} }),
      });
    });
  });

  describe('markRead', () => {
    it('throws NotFoundException for a notification that does not belong to this user', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('n1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('sets readAt on an unread notification', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'n1', readAt: null });
      prisma.notification.update.mockResolvedValue({});

      await service.markRead('n1', 'user-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { readAt: expect.any(Date) },
      });
    });

    it('preserves the original readAt instead of bumping it when already read', async () => {
      const originalReadAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.notification.findFirst.mockResolvedValue({ id: 'n1', readAt: originalReadAt });
      prisma.notification.update.mockResolvedValue({});

      await service.markRead('n1', 'user-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { readAt: originalReadAt },
      });
    });
  });

  describe('unreadCount', () => {
    it('returns the count of unread notifications for the user', async () => {
      prisma.notification.count.mockResolvedValue(5);

      await expect(service.unreadCount('user-1')).resolves.toEqual({ count: 5 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });
  });

  describe('markAllRead', () => {
    it('bulk-marks every unread notification for the user as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllRead('user-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ success: true, message: 'All notifications marked as read' });
    });
  });
});
