import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface AuditLogEntry {
  organizationId?: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          beforeState: entry.beforeState as never,
          afterState: entry.afterState as never,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          requestId: entry.requestId,
        },
      });
    } catch (err) {
      // Audit logging must never break the request it's auditing.
      this.logger.error(`Failed to record audit log entry: ${entry.action}`, err as Error);
    }
  }
}
