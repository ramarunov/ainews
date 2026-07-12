import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string, key: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });

    return setting?.value ?? null;
  }

  async set(
    organizationId: string,
    key: string,
    value: any,
    updatedBy: string,
    isPublic = false,
  ) {
    return this.prisma.setting.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: {
        organizationId,
        key,
        value: value as Prisma.InputJsonValue,
        isPublic,
        updatedBy,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        isPublic,
        updatedBy,
      },
    });
  }

  async list(organizationId: string, publicOnly = false) {
    return this.prisma.setting.findMany({
      where: {
        organizationId,
        ...(publicOnly && { isPublic: true }),
      },
      orderBy: { key: 'asc' },
    });
  }

  async remove(organizationId: string, key: string) {
    await this.prisma.setting.delete({
      where: { organizationId_key: { organizationId, key } },
    });

    return { success: true, message: 'Setting removed' };
  }
}
