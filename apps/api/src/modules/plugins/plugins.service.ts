import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { InstallPluginDto } from './dto/plugin.dto';

@Injectable()
export class PluginsService {
  constructor(private readonly prisma: PrismaService) {}

  async install(dto: InstallPluginDto, organizationId: string) {
    return this.prisma.plugin.create({
      data: {
        organizationId,
        name: dto.name,
        slug: dto.slug,
        version: dto.version,
        description: dto.description,
        author: dto.author,
        homepage: dto.homepage,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        isActive: false,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.plugin.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const plugin = await this.prisma.plugin.findFirst({
      where: { id, organizationId },
    });

    if (!plugin) {
      throw new NotFoundException('Plugin not found');
    }

    return plugin;
  }

  async activate(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.plugin.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async deactivate(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.plugin.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async updateConfig(id: string, config: object, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.plugin.update({
      where: { id },
      data: { config: config as Prisma.InputJsonValue },
    });
  }

  async uninstall(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    await this.prisma.plugin.delete({ where: { id } });

    return { success: true, message: 'Plugin uninstalled' };
  }
}
