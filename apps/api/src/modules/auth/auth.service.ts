import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { createHash, randomBytes } from 'crypto';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { DEFAULT_ROLES } from '../../common/constants/default-roles';
import { EncryptionService } from '../../common/crypto/encryption.service';

const LOGIN_ATTEMPTS_PREFIX = 'login_attempts:';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 900; // 15 minutes in seconds

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly encryption: EncryptionService,
  ) {}

  // ─── Registration ──────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // Check if email already exists
    const exists = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    if (exists) {
      throw new ConflictException('Email address is already registered');
    }

    // Find or create organization
    let organizationId = dto.organizationId;
    let isNewOrg = false;
    if (!organizationId && dto.organizationName) {
      const org = await this.prisma.organization.create({
        data: {
          name: dto.organizationName,
          slug: await this.generateOrgSlug(dto.organizationName),
        },
      });
      organizationId = org.id;
      isNewOrg = true;
      await this.createDefaultRoles(organizationId);
    }

    if (!organizationId) {
      throw new BadRequestException('Organization is required');
    }

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        organizationId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: `${dto.firstName} ${dto.lastName}`,
      },
    });

    // The first user of a brand-new org is its owner/admin; anyone joining
    // an existing org via organizationId starts as a writer by default.
    const defaultRoleSlug = isNewOrg ? 'admin' : 'writer';
    const defaultRole = await this.prisma.role.findFirst({
      where: { organizationId, slug: defaultRoleSlug },
    });

    if (defaultRole) {
      await this.prisma.userRole.create({
        data: { userId: user.id, roleId: defaultRole.id },
      });
    }

    this.eventEmitter.emit('user.registered', { userId: user.id, email: user.email });

    const userWithRoles = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { userRoles: { include: { role: true } } },
    });

    return this.issueTokens(userWithRoles);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async validateUser(email: string, password: string) {
    // Check rate limit
    const attemptsKey = `${LOGIN_ATTEMPTS_PREFIX}${email.toLowerCase()}`;
    const attempts = await this.redis.get(attemptsKey);
    if (attempts && parseInt(attempts) >= MAX_LOGIN_ATTEMPTS) {
      throw new ForbiddenException(
        'Account temporarily locked due to too many failed login attempts',
      );
    }

    // Use constant-time comparison path to prevent timing attacks
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    // Always hash to prevent timing attacks (even if user not found)
    const dummyHash = '$2b$12$invalidhashusedfortimingattackprevention000000000000000';
    const hashToCompare = user?.passwordHash ?? dummyHash;
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordMatches) {
      // Increment failed attempts
      await this.redis
        .multi()
        .incr(attemptsKey)
        .expire(attemptsKey, LOCKOUT_DURATION)
        .exec();

      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    // Clear failed attempts on success
    await this.redis.del(attemptsKey);

    return user;
  }

  async login(user: any, ipAddress?: string, userAgent?: string) {
    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        loginCount: { increment: 1 },
      },
    });

    this.eventEmitter.emit('user.login', {
      userId: user.id,
      ipAddress,
      userAgent,
    });

    return this.issueTokens(user);
  }

  // ─── Token Management ──────────────────────────────────────────────────────

  async issueTokens(user: any) {
    const permissions = this.extractPermissions(user);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      permissions,
    });

    // Generate refresh token
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const family = randomBytes(16).toString('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        family,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        organizationId: user.organizationId,
        isSuperadmin: user.isSuperadmin,
        permissions,
      },
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { userRoles: { include: { role: true } } } } },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Token reuse detected — revoke entire family
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family },
        data: { revokedAt: new Date(), revokeReason: 'family_compromised' },
      });
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Revoke current token and issue new one
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), revokeReason: 'rotated' },
    });

    return this.issueTokens(stored.user);
  }

  async logout(userId: string, refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash },
      data: { revokedAt: new Date(), revokeReason: 'logout' },
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'logout_all' },
    });
  }

  // ─── MFA ──────────────────────────────────────────────────────────────────

  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = authenticator.generateSecret(32);
    const appName = this.config.get('MFA_APP_NAME', 'AI News CMS');
    const otpAuthUrl = authenticator.keyuri(user.email, appName, secret);
    const qrCodeUrl = await toDataURL(otpAuthUrl);

    // Store secret temporarily (not enabled until verified), encrypted at
    // rest per SECURITY.md 5.3 ("MFA secrets encrypted with
    // application-level encryption key (AES-256-GCM)").
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: this.encryption.encrypt(secret) },
    });

    return { secret, qrCodeUrl, otpAuthUrl };
  }

  async verifyAndEnableMfa(userId: string, token: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.mfaSecret) {
      throw new BadRequestException('MFA setup not initiated');
    }

    const isValid = authenticator.verify({
      token,
      secret: this.encryption.decrypt(user.mfaSecret),
    });
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA token');
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      randomBytes(4).toString('hex'),
    );

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, rounds)),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: hashedBackupCodes,
      },
    });

    return { backupCodes };
  }

  async verifyMfaToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.mfaEnabled || !user.mfaSecret) {
      return false;
    }

    return authenticator.verify({ token, secret: this.encryption.decrypt(user.mfaSecret) });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private extractPermissions(user: any): string[] {
    if (!user.userRoles) return [];
    return [
      ...new Set<string>(
        user.userRoles.flatMap((ur: any) => ur.role?.permissions ?? []),
      ),
    ];
  }

  private async createDefaultRoles(organizationId: string): Promise<void> {
    await this.prisma.role.createMany({
      data: DEFAULT_ROLES.map((role) => ({
        organizationId,
        name: role.name,
        slug: role.slug,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      })),
    });
  }

  private async generateOrgSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    let slug = base;
    let counter = 1;

    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${base}-${counter++}`;
    }

    return slug;
  }
}
