import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateUserDto, UpdateOwnProfileDto, UserQueryDto } from './dto/user.dto';

const SAFE_SELECT: Prisma.UserSelect = {
  id: true,
  organizationId: true,
  email: true,
  emailVerifiedAt: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  timezone: true,
  locale: true,
  mfaEnabled: true,
  lastLoginAt: true,
  loginCount: true,
  isActive: true,
  isSuperadmin: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(query: UserQueryDto, organizationId: string) {
    const {
      search,
      isActive,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const where: Prisma.UserWhereInput = {
      organizationId,
      deletedAt: null,
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        select: SAFE_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page: Math.max(1, page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: {
        ...SAFE_SELECT,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string, organizationId: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), organizationId, deletedAt: null },
    });
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto, organizationId: string) {
    await this.findOne(id, organizationId);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
      },
      select: SAFE_SELECT,
    });

    this.eventEmitter.emit('user.updated', {
      userId: id,
      organizationId,
    });

    return updated;
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
      },
      select: SAFE_SELECT,
    });

    this.eventEmitter.emit('user.updated', {
      userId,
      organizationId: existing.organizationId,
    });

    return updated;
  }

  // ─── Deactivate / Reactivate ───────────────────────────────────────────────

  async deactivate(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: SAFE_SELECT,
    });

    this.eventEmitter.emit('user.deactivated', { userId: id, organizationId });

    return updated;
  }

  async reactivate(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: SAFE_SELECT,
    });

    this.eventEmitter.emit('user.reactivated', { userId: id, organizationId });

    return updated;
  }

  // ─── Delete (Soft) ─────────────────────────────────────────────────────────

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    this.eventEmitter.emit('user.deleted', { userId: id, organizationId });

    return { success: true, message: 'User deleted' };
  }

  // ─── Roles ─────────────────────────────────────────────────────────────────

  async assignRole(
    userId: string,
    roleId: string,
    organizationId: string,
    grantedBy: string,
  ) {
    await this.findOne(userId, organizationId);

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    if (existing) {
      throw new ConflictException('Role already assigned to user');
    }

    const userRole = await this.prisma.userRole.create({
      data: { userId, roleId, grantedBy },
      include: { role: true },
    });

    this.eventEmitter.emit('user.role_assigned', {
      userId,
      roleId,
      organizationId,
      grantedBy,
    });

    return userRole;
  }

  async revokeRole(userId: string, roleId: string, organizationId: string) {
    await this.findOne(userId, organizationId);

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    if (!existing) {
      throw new NotFoundException('Role is not assigned to user');
    }

    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });

    this.eventEmitter.emit('user.role_revoked', {
      userId,
      roleId,
      organizationId,
    });

    return { success: true, message: 'Role revoked' };
  }
}
