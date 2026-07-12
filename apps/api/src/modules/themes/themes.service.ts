import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { withOrgTransaction } from '../../infrastructure/prisma/rls-extension';
import { InstallThemeDto } from './dto/theme.dto';

@Injectable()
export class ThemesService {
  constructor(private readonly prisma: PrismaService) {}

  async install(dto: InstallThemeDto, organizationId: string) {
    return this.prisma.theme.create({
      data: {
        organizationId,
        name: dto.name,
        slug: dto.slug,
        version: dto.version,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        customCss: dto.customCss,
        isActive: false,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.theme.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const theme = await this.prisma.theme.findFirst({
      where: { id, organizationId },
    });

    if (!theme) {
      throw new NotFoundException('Theme not found');
    }

    return theme;
  }

  async activate(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    return withOrgTransaction(this.prisma, async (tx) => {
      await tx.theme.updateMany({
        where: { organizationId, id: { not: id } },
        data: { isActive: false },
      });

      return tx.theme.update({
        where: { id },
        data: { isActive: true },
      });
    });
  }

  async updateConfig(id: string, config: object, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.theme.update({
      where: { id },
      data: { config: config as Prisma.InputJsonValue },
    });
  }

  async uninstall(id: string, organizationId: string) {
    const theme = await this.findOne(id, organizationId);

    if (theme.isActive) {
      throw new BadRequestException('Cannot uninstall the active theme');
    }

    await this.prisma.theme.delete({ where: { id } });

    return { success: true, message: 'Theme uninstalled' };
  }
}
