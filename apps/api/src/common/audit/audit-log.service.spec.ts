import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let prisma: any;
  let service: AuditLogService;

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn(),
      },
    };
    service = new AuditLogService(prisma);
  });

  it('writes an audit log row with the given fields', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

    await service.record({
      organizationId: 'org-1',
      userId: 'user-1',
      action: 'articles:write',
      entityType: 'articles',
      entityId: 'article-1',
      afterState: { title: 'Hello' },
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-1',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        action: 'articles:write',
        entityType: 'articles',
        entityId: 'article-1',
        afterState: { title: 'Hello' },
      }),
    });
  });

  it('swallows a Prisma failure instead of throwing, so it never breaks the request being audited', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('DB unavailable'));

    await expect(
      service.record({ action: 'articles:write', entityType: 'articles' }),
    ).resolves.toBeUndefined();
  });
});
