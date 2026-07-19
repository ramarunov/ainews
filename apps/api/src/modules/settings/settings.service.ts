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

  // isPublic is left optional (not defaulted) so an update that doesn't
  // mention it can't silently flip an already-public setting back to
  // private - PUT /settings/:key with just { value } would otherwise reset
  // isPublic to false and quietly drop the setting off the public site.
  // A brand-new setting with no isPublic given still defaults to private,
  // same as before.
  async set(
    organizationId: string,
    key: string,
    value: any,
    updatedBy: string,
    isPublic?: boolean,
  ) {
    return this.prisma.setting.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: {
        organizationId,
        key,
        value: value as Prisma.InputJsonValue,
        isPublic: isPublic ?? false,
        updatedBy,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        ...(isPublic !== undefined && { isPublic }),
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
