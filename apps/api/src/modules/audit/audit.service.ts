import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AuditLogQueryDto, organizationId: string) {
    const { entityType, page = 1, limit = 20 } = query;

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(entityType && { entityType }),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: Math.max(1, page), limit: take, totalPages: Math.ceil(total / take) },
    };
  }
}
