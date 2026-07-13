import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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
  userRoles: {
    select: { role: { select: { id: true, name: true, slug: true } } },
  },
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

  // ─── GDPR: Data Export & Erasure ───────────────────────────────────────────

  async exportOwnData(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: SAFE_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [articles, mediaFiles, recentActivity] = await Promise.all([
      this.prisma.article.findMany({
        where: { primaryAuthorId: userId },
        select: { id: true, title: true, slug: true, status: true, createdAt: true },
      }),
      this.prisma.mediaFile.findMany({
        where: { uploadedBy: userId, deletedAt: null },
        select: { id: true, filename: true, originalName: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      profile: user,
      articles,
      mediaFiles,
      recentActivity,
      exportedAt: new Date().toISOString(),
    };
  }

  async eraseOwnAccount(userId: string, password?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Only verify a password if the account has one (OAuth-only accounts
    // have no passwordHash to check against).
    if (user.passwordHash) {
      if (!password) {
        throw new BadRequestException('Password confirmation is required to erase your account');
      }
      const matches = await bcrypt.compare(password, user.passwordHash);
      if (!matches) {
        throw new UnauthorizedException('Incorrect password');
      }
    }

    // Pseudonymize PII rather than hard-deleting: the row (and its id) stays
    // in place so AuditLog/Article foreign keys keep pointing at a valid
    // user, preserving audit trail integrity per SECURITY.md's GDPR section.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.local`,
        firstName: 'Deleted',
        lastName: 'User',
        displayName: 'Deleted User',
        avatarUrl: null,
        bio: null,
        passwordHash: null,
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
        isActive: false,
        deletedAt: new Date(),
      },
    });

    // Revoke every outstanding refresh token so no new access token can be
    // issued. Note: an access token already in flight stays valid until its
    // own short expiry — there's no token blacklist yet.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'account_erased' },
    });

    this.eventEmitter.emit('user.erased', { userId, organizationId: user.organizationId });

    return { success: true, message: 'Your account data has been erased.' };
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
