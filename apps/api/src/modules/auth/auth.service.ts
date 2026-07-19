import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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
import { EmailService } from '../../common/email/email.service';

const LOGIN_ATTEMPTS_PREFIX = 'login_attempts:';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 900; // 15 minutes in seconds
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, per SECURITY.md
const MFA_CHALLENGE_PREFIX = 'mfa:challenge:';
const MFA_CHALLENGE_TTL_SECONDS = 300; // 5 minutes

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
    private readonly emailService: EmailService,
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

  // ─── OAuth (AUTH-002) ───────────────────────────────────────────────────────

  /**
   * Shared find-or-create for both Google and GitHub strategies. Three
   * cases, same priority order a user would expect:
   *  1. This exact provider account has signed in before -> just log in.
   *  2. No OauthAccount yet, but a user with this email already exists
   *     (e.g. they originally registered with a password) -> link the new
   *     provider to that existing account rather than creating a duplicate.
   *  3. Neither exists -> register a brand-new org + user, same "first
   *     user of a new org is its admin" rule as email/password register().
   */
  async findOrCreateOauthUser(
    provider: string,
    providerId: string,
    profile: { email: string; firstName: string; lastName: string; avatarUrl?: string },
  ) {
    if (!profile.email) {
      throw new BadRequestException(`${provider} did not provide an email address for this account`);
    }

    const existingOauthAccount = await this.prisma.oauthAccount.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: { include: { userRoles: { include: { role: true } } } } },
    });

    if (existingOauthAccount) {
      return this.issueTokens(existingOauthAccount.user);
    }

    let user = await this.prisma.user.findFirst({
      where: { email: profile.email.toLowerCase(), deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (user) {
      await this.prisma.oauthAccount.create({
        data: { userId: user.id, provider, providerId, profile: profile as any },
      });
      return this.issueTokens(user);
    }

    const org = await this.prisma.organization.create({
      data: {
        name: `${profile.firstName} ${profile.lastName}'s Organization`,
        slug: await this.generateOrgSlug(`${profile.firstName}-${profile.lastName}`),
      },
    });
    await this.createDefaultRoles(org.id);

    const created = await this.prisma.user.create({
      data: {
        organizationId: org.id,
        email: profile.email.toLowerCase(),
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: `${profile.firstName} ${profile.lastName}`,
        avatarUrl: profile.avatarUrl,
        emailVerifiedAt: new Date(), // the OAuth provider already verified this email
      },
    });

    const adminRole = await this.prisma.role.findFirst({
      where: { organizationId: org.id, slug: 'admin' },
    });
    if (adminRole) {
      await this.prisma.userRole.create({ data: { userId: created.id, roleId: adminRole.id } });
    }

    await this.prisma.oauthAccount.create({
      data: { userId: created.id, provider, providerId, profile: profile as any },
    });

    this.eventEmitter.emit('user.registered', { userId: created.id, email: created.email });

    user = await this.prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      include: { userRoles: { include: { role: true } } },
    });

    return this.issueTokens(user);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async validateUser(email: string, password: string, ipAddress?: string) {
    // Keyed on IP+email together, not email alone - an email-only lockout
    // lets an attacker lock a victim out of their own account from
    // anywhere just by deliberately failing their password a few times,
    // with no need to guess it (a classic account-lockout DoS). Combining
    // with the source IP means that only actually locks out attempts from
    // that same attacker's IP, while the real account owner - almost
    // certainly logging in from a different IP - is unaffected.
    const attemptsKey = `${LOGIN_ATTEMPTS_PREFIX}${email.toLowerCase()}:${ipAddress ?? 'unknown'}`;
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
    // MFA-enabled accounts don't get tokens from a bare email+password
    // check - otherwise "enabling MFA" would be purely decorative. Instead
    // of a full session, hand back a short-lived, single-use challenge
    // token (opaque, stored server-side in Redis - never a signed JWT,
    // which JwtStrategy would otherwise accept as a real access token).
    if (user.mfaEnabled) {
      const challengeToken = randomBytes(32).toString('hex');
      await this.redis.set(
        `${MFA_CHALLENGE_PREFIX}${challengeToken}`,
        user.id,
        'EX',
        MFA_CHALLENGE_TTL_SECONDS,
      );
      return { mfaRequired: true, challengeToken };
    }

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

  async verifyMfaLogin(challengeToken: string, code: string, ipAddress?: string, userAgent?: string) {
    const key = `${MFA_CHALLENGE_PREFIX}${challengeToken}`;
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new UnauthorizedException('MFA challenge has expired - please log in again');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('MFA challenge has expired - please log in again');
    }

    const isValidTotp = await this.verifyMfaToken(user.id, code);
    if (!isValidTotp) {
      const matchedIndex = await this.findMatchingBackupCodeIndex(user.mfaBackupCodes, code);
      if (matchedIndex === -1) {
        throw new UnauthorizedException('Invalid MFA code');
      }
      // Backup codes are single-use - consume it immediately.
      const remaining = [...user.mfaBackupCodes];
      remaining.splice(matchedIndex, 1);
      await this.prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: remaining } });
    }

    // Single-use: this challenge can't be replayed even within its TTL.
    await this.redis.del(key);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress, loginCount: { increment: 1 } },
    });
    this.eventEmitter.emit('user.login', { userId: user.id, ipAddress, userAgent });

    return this.issueTokens(user);
  }

  async disableMfa(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const passwordMatches = user.passwordHash && (await bcrypt.compare(password, user.passwordHash));
    if (!passwordMatches) {
      throw new UnauthorizedException('Incorrect password');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    });
  }

  private async findMatchingBackupCodeIndex(hashedCodes: string[], code: string): Promise<number> {
    for (let i = 0; i < hashedCodes.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(code, hashedCodes[i])) return i;
    }
    return -1;
  }

  async getMfaStatus(userId: string): Promise<{ enabled: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaEnabled: true },
    });
    return { enabled: user.mfaEnabled };
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

  // ─── Password Reset ─────────────────────────────────────────────────────────

  /**
   * Always returns the same generic result regardless of whether `email`
   * belongs to an account — the caller-facing response must not leak
   * account existence. The actual token + email are only ever generated
   * when a matching, active user is found.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null, isActive: true },
    });

    if (!user) return;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3100');
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    // Fire-and-forget: an SMTP outage must not turn a password-reset
    // request into a 500 (same convention as SearchService.logSearch()).
    this.emailService
      .send({
        to: user.email,
        subject: 'Reset your password',
        html: `<p>Someone requested a password reset for your account.</p>
<p><a href="${resetUrl}">Click here to reset your password</a> — this link expires in 1 hour.</p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
        text: `Reset your password: ${resetUrl} (expires in 1 hour). If you didn't request this, ignore this email.`,
      })
      .catch((err) => console.error('[AuthService] Failed to send password reset email', err));
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt < new Date()
    ) {
      throw new BadRequestException('This password reset link is invalid or has expired');
    }

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // A compromised session shouldn't survive a password reset — same
      // "revoke everything outstanding" principle as GDPR account erasure.
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'password_reset' },
      }),
    ]);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Mirrors eraseOwnAccount()'s handling of OAuth-only accounts (no
    // passwordHash) - only verify a current password if one actually
    // exists to check against.
    if (user.passwordHash) {
      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Same "a compromised session shouldn't survive a password change"
      // principle as resetPassword()/eraseOwnAccount().
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'password_changed' },
      }),
    ]);
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
