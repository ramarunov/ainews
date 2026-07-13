import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Find Current ──────────────────────────────────────────────────────────

  async findCurrent(organizationId: string) {
    return this.findOne(organizationId);
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  // ─── Roles ─────────────────────────────────────────────────────────────────

  /**
   * Powers the "assign role" picker in the Users admin UI — assignRole()/
   * revokeRole() on UsersService already existed and take a roleId, but
   * there was no way for the frontend to discover which role IDs exist
   * for this organization until now.
   */
  async listRoles(organizationId: string) {
    return this.prisma.role.findMany({
      where: { organizationId },
      select: { id: true, name: true, slug: true, description: true, isSystem: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(organizationId: string, dto: UpdateOrganizationDto) {
    await this.findOne(organizationId);

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.domain !== undefined && { domain: dto.domain }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.settings !== undefined && {
          settings: dto.settings as Prisma.InputJsonValue,
        }),
        ...(dto.metadata !== undefined && {
          metadata: dto.metadata as Prisma.InputJsonValue,
        }),
      },
    });

    this.eventEmitter.emit('organization.updated', {
      organizationId,
    });

    return updated;
  }
}
