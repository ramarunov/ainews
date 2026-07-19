import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { DEFAULT_ROLES } from '../../common/constants/default-roles';
import { EncryptionService } from '../../common/crypto/encryption.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let config: any;
  let eventEmitter: any;
  let redis: any;
  let emailService: any;

  // In-memory fakes for the two tables register()/login() actually depend on,
  // so createMany/create/findFirst behave consistently across a test.
  let roles: any[];
  let userRoles: any[];

  beforeEach(() => {
    roles = [];
    userRoles = [];

    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      role: {
        createMany: jest.fn((args: any) => {
          roles.push(...args.data);
          return Promise.resolve({ count: args.data.length });
        }),
        findFirst: jest.fn((args: any) =>
          Promise.resolve(
            roles.find(
              (r) =>
                r.organizationId === args.where.organizationId &&
                r.slug === args.where.slug,
            ) ?? null,
          ),
        ),
      },
      userRole: {
        create: jest.fn((args: any) => {
          userRoles.push(args.data);
          return Promise.resolve(args.data);
        }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      oauthAccount: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };

    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    config = { get: jest.fn((_key: string, fallback?: any) => fallback) };
    eventEmitter = { emit: jest.fn() };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      multi: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
      del: jest.fn().mockResolvedValue(1),
    };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      prisma,
      {} as any, // UsersService is unused by the methods under test
      jwtService,
      config,
      eventEmitter,
      redis,
      new EncryptionService(config),
      emailService,
    );
  });

  describe('register', () => {
    it('rejects registration when the email is already taken', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({
          email: 'taken@example.com',
          password: 'Password123!',
          firstName: 'A',
          lastName: 'B',
          organizationName: 'Acme',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('makes the first user of a brand-new org an admin with every permission', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
      });
      const createdUser = {
        id: 'user-1',
        organizationId: 'org-1',
        email: 'owner@acme.com',
        firstName: 'Owner',
        lastName: 'Person',
      };
      prisma.user.create.mockResolvedValue(createdUser);

      prisma.user.findUniqueOrThrow.mockImplementation(() =>
        Promise.resolve({
          ...createdUser,
          userRoles: userRoles.map((ur) => ({
            role: roles.find((r) => r.id === ur.roleId),
          })),
        }),
      );

      const result = await service.register({
        email: 'owner@acme.com',
        password: 'Password123!',
        firstName: 'Owner',
        lastName: 'Person',
        organizationName: 'Acme',
      } as any);

      // All 4 DEFAULT_ROLES were provisioned for the new org.
      expect(roles).toHaveLength(DEFAULT_ROLES.length);
      expect(roles.map((r) => r.slug)).toEqual(
        expect.arrayContaining(['admin', 'editor', 'writer', 'seo-manager']),
      );

      // The new user was assigned the admin role, not left with none.
      expect(userRoles).toHaveLength(1);
      expect(prisma.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      );

      // Regression test: issueTokens must receive a user with userRoles
      // populated, otherwise permissions silently come back empty.
      expect(result.user.permissions.length).toBeGreaterThan(0);
      expect(result.user.permissions).toEqual(
        expect.arrayContaining(['articles:publish', 'organizations:write']),
      );
    });

    it('assigns the writer role (not admin) to a user joining an existing org', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      roles.push(
        ...DEFAULT_ROLES.map((r) => ({ ...r, id: `${r.slug}-role-id`, organizationId: 'org-existing' })),
      );

      const createdUser = {
        id: 'user-2',
        organizationId: 'org-existing',
        email: 'writer@acme.com',
      };
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...createdUser,
        userRoles: userRoles.map((ur) => ({
          role: roles.find((r) => r.id === ur.roleId),
        })),
      });

      await service.register({
        email: 'writer@acme.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'Writer',
        organizationId: 'org-existing',
      } as any);

      expect(prisma.organization.create).not.toHaveBeenCalled();
      expect(userRoles).toHaveLength(1);
      const assignedRole = roles.find((r) => r.id === userRoles[0].roleId);
      expect(assignedRole.slug).toBe('writer');
    });

    it('requires an organization when neither organizationId nor organizationName is given', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.register({
          email: 'noorg@example.com',
          password: 'Password123!',
          firstName: 'No',
          lastName: 'Org',
        } as any),
      ).rejects.toThrow('Organization is required');
    });
  });

  describe('validateUser', () => {
    it('throws UnauthorizedException for a non-existent user without leaking which check failed', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.validateUser('nobody@example.com', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);

      expect(redis.multi).toHaveBeenCalled();
    });

    it('locks out an account after too many failed attempts', async () => {
      redis.get.mockResolvedValue('5');

      await expect(
        service.validateUser('locked@example.com', 'whatever'),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a deactivated user even with the correct password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-3',
        passwordHash,
        isActive: false,
      });

      await expect(
        service.validateUser('inactive@example.com', 'correct-password'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('keys the lockout counter by IP and email together, not email alone', async () => {
      await expect(
        service.validateUser('victim@example.com', 'whatever', '203.0.113.9'),
      ).rejects.toThrow(UnauthorizedException);

      expect(redis.get).toHaveBeenCalledWith('login_attempts:victim@example.com:203.0.113.9');
    });

    it("does not lock out the account owner's own IP just because an attacker locked theirs", async () => {
      // An attacker deliberately fails the password 5 times from their own
      // IP to try to lock the victim out entirely - the real owner, logging
      // in correctly from a different IP, must be unaffected.
      redis.get.mockImplementation((key: string) =>
        Promise.resolve(key.endsWith(':198.51.100.1') ? '5' : null),
      );
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-victim',
        passwordHash,
        isActive: true,
      });

      const result = await service.validateUser(
        'victim@example.com',
        'correct-password',
        '203.0.113.9',
      );

      expect(result.id).toBe('user-victim');
    });

    it("still locks out repeated failures from the attacker's own IP+email combination", async () => {
      redis.get.mockImplementation((key: string) =>
        Promise.resolve(key.endsWith(':198.51.100.1') ? '5' : null),
      );

      await expect(
        service.validateUser('victim@example.com', 'whatever', '198.51.100.1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('MFA', () => {
    it('setupMfa stores the TOTP secret encrypted, not in plaintext', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        mfaEnabled: false,
      });

      const result = await service.setupMfa('user-1');

      const storedSecret = prisma.user.update.mock.calls[0][0].data.mfaSecret;
      expect(storedSecret).not.toBe(result.secret);
      // Round-trips back to the same raw secret returned to the caller (the
      // one actually embedded in the QR code / otpAuthUrl).
      const encryption = new EncryptionService(config);
      expect(encryption.decrypt(storedSecret)).toBe(result.secret);
    });

    it('verifyAndEnableMfa decrypts the stored secret before checking the TOTP token', async () => {
      const encryption = new EncryptionService(config);
      const rawSecret = authenticator.generateSecret(32);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        mfaSecret: encryption.encrypt(rawSecret),
      });
      prisma.user.update.mockResolvedValue({});
      const validToken = authenticator.generate(rawSecret);

      const result = await service.verifyAndEnableMfa('user-1', validToken);

      expect(result.backupCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mfaEnabled: true }) }),
      );
    });

    it('verifyAndEnableMfa rejects an invalid token', async () => {
      const encryption = new EncryptionService(config);
      const rawSecret = authenticator.generateSecret(32);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        mfaSecret: encryption.encrypt(rawSecret),
      });

      await expect(service.verifyAndEnableMfa('user-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('verifyMfaToken decrypts the stored secret and validates a live TOTP code', async () => {
      const encryption = new EncryptionService(config);
      const rawSecret = authenticator.generateSecret(32);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: encryption.encrypt(rawSecret),
      });
      const validToken = authenticator.generate(rawSecret);

      await expect(service.verifyMfaToken('user-1', validToken)).resolves.toBe(true);
    });

    it('verifyMfaToken returns false without decrypting anything when MFA is not enabled', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: false,
        mfaSecret: null,
      });

      await expect(service.verifyMfaToken('user-1', '123456')).resolves.toBe(false);
    });
  });

  describe('login (MFA enforcement)', () => {
    it('does not issue real tokens for an MFA-enabled account - returns a challenge token instead', async () => {
      const user = { id: 'user-1', mfaEnabled: true };

      const result = await service.login(user, '1.2.3.4', 'test-agent');

      expect(result).toEqual({ mfaRequired: true, challengeToken: expect.any(String) });
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('mfa:challenge:'),
        'user-1',
        'EX',
        300,
      );
      // Regression guard: an MFA-enabled account must never reach
      // issueTokens()/lastLoginAt update from the bare password check alone.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('user.login', expect.anything());
    });

    it('issues real tokens immediately for an account without MFA', async () => {
      const user = { id: 'user-1', mfaEnabled: false, userRoles: [] };
      prisma.user.update.mockResolvedValue({});

      const result = await service.login(user, '1.2.3.4', 'test-agent');

      expect(result).toHaveProperty('accessToken');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('verifyMfaLogin', () => {
    it('rejects an unknown or expired challenge token', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.verifyMfaLogin('bogus-token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('completes login with a valid TOTP code and consumes the challenge (single-use)', async () => {
      const encryption = new EncryptionService(config);
      const rawSecret = authenticator.generateSecret(32);
      const encryptedSecret = encryption.encrypt(rawSecret);
      redis.get.mockResolvedValue('user-1');
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaBackupCodes: [],
        userRoles: [],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
      });
      prisma.user.update.mockResolvedValue({});
      const validToken = authenticator.generate(rawSecret);

      const result = await service.verifyMfaLogin('real-challenge', validToken, '1.2.3.4', 'agent');

      expect(result).toHaveProperty('accessToken');
      expect(redis.del).toHaveBeenCalledWith(expect.stringContaining('real-challenge'));
    });

    it('accepts a valid backup code and consumes it so it cannot be reused', async () => {
      const rawCode = 'deadbeef';
      const rounds = 4; // low cost factor - only speed matters in this test
      const hashedCode = await bcrypt.hash(rawCode, rounds);
      redis.get.mockResolvedValue('user-1');
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: new EncryptionService(config).encrypt(authenticator.generateSecret(32)),
        mfaBackupCodes: [hashedCode, 'some-other-hash'],
        userRoles: [],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: new EncryptionService(config).encrypt(authenticator.generateSecret(32)),
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.verifyMfaLogin('real-challenge', rawCode, '1.2.3.4', 'agent');

      expect(result).toHaveProperty('accessToken');
      const backupCodesUpdateCall = prisma.user.update.mock.calls.find(
        (c: any) => c[0].data.mfaBackupCodes !== undefined,
      );
      expect(backupCodesUpdateCall[0].data.mfaBackupCodes).toEqual(['some-other-hash']);
    });

    it('rejects an invalid code without consuming any backup code', async () => {
      redis.get.mockResolvedValue('user-1');
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: new EncryptionService(config).encrypt(authenticator.generateSecret(32)),
        mfaBackupCodes: [],
        userRoles: [],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        mfaEnabled: true,
        mfaSecret: new EncryptionService(config).encrypt(authenticator.generateSecret(32)),
      });

      await expect(service.verifyMfaLogin('real-challenge', '000000', '1.2.3.4', 'agent')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('disableMfa', () => {
    it('turns MFA off after confirming the current password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', passwordHash });
      prisma.user.update.mockResolvedValue({});

      await service.disableMfa('user-1', 'correct-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
      });
    });

    it('rejects an incorrect password without touching MFA state', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', passwordHash });

      await expect(service.disableMfa('user-1', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('findOrCreateOauthUser', () => {
    const profile = {
      email: 'oauth-user@example.com',
      firstName: 'Oscar',
      lastName: 'Auth',
      avatarUrl: 'https://example.com/avatar.png',
    };

    it('logs in directly when this provider account has signed in before', async () => {
      const existingUser = { id: 'user-1', email: profile.email, userRoles: [] };
      prisma.oauthAccount.findUnique.mockResolvedValue({
        id: 'oauth-1',
        user: existingUser,
      });

      const result = await service.findOrCreateOauthUser('google', 'google-id-1', profile);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.organization.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-1');
    });

    it('links the provider to an existing user found by email instead of creating a duplicate', async () => {
      prisma.oauthAccount.findUnique.mockResolvedValue(null);
      const existingUser = { id: 'user-2', email: profile.email, userRoles: [] };
      prisma.user.findFirst.mockResolvedValue(existingUser);

      const result = await service.findOrCreateOauthUser('github', 'github-id-1', profile);

      expect(prisma.oauthAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-2',
            provider: 'github',
            providerId: 'github-id-1',
          }),
        }),
      );
      expect(prisma.organization.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-2');
    });

    it('creates a brand-new org + admin user when neither the oauth account nor the email exist', async () => {
      prisma.oauthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValueOnce(null); // no existing user by email
      prisma.organization.create.mockResolvedValue({ id: 'org-new' });
      prisma.user.create.mockResolvedValue({ id: 'user-new' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-new',
        email: profile.email,
        userRoles: [{ role: { permissions: ['articles:read'] } }],
      });

      const result = await service.findOrCreateOauthUser('google', 'google-id-2', profile);

      expect(prisma.organization.create).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-new',
            email: profile.email,
            emailVerifiedAt: expect.any(Date),
          }),
        }),
      );
      // The new org's admin role must actually be assigned - not just the
      // org/user rows created with nothing linking them together.
      expect(userRoles).toContainEqual(
        expect.objectContaining({ userId: 'user-new' }),
      );
      expect(result.user.id).toBe('user-new');
    });

    it('rejects when the provider gives no email at all', async () => {
      await expect(
        service.findOrCreateOauthUser('google', 'google-id-3', { ...profile, email: '' }),
      ).rejects.toThrow('did not provide an email');
    });
  });

  describe('requestPasswordReset', () => {
    it('creates a token and emails the user when the account exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', email: 'jane@example.com' });

      await service.requestPasswordReset('jane@example.com');
      await new Promise(process.nextTick); // flush the fire-and-forget email send

      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'jane@example.com', subject: 'Reset your password' }),
      );
    });

    it('does nothing and does not leak whether the account exists when the email is unknown', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await service.requestPasswordReset('nobody@example.com');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('does not throw even if sending the email fails', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', email: 'jane@example.com' });
      emailService.send.mockRejectedValue(new Error('SMTP down'));

      await expect(service.requestPasswordReset('jane@example.com')).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewPassword123!')).rejects.toThrow(
        'invalid or has expired',
      );
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 100_000),
      });

      await expect(service.resetPassword('used-token', 'NewPassword123!')).rejects.toThrow(
        'invalid or has expired',
      );
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.resetPassword('expired-token', 'NewPassword123!')).rejects.toThrow(
        'invalid or has expired',
      );
    });

    it('updates the password, marks the token used, and revokes all refresh tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await service.resetPassword('good-token', 'NewPassword123!');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'password_reset' },
      });
    });
  });

  describe('changePassword', () => {
    it('throws NotFoundException for a missing or already-deleted user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.changePassword('user-1', 'OldPass123!', 'NewPass123!')).rejects.toThrow(
        'User not found',
      );
    });

    it('rejects an incorrect current password without changing anything', async () => {
      const correctHash = await bcrypt.hash('CorrectPass123!', 4);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', passwordHash: correctHash });

      await expect(
        service.changePassword('user-1', 'WrongPass123!', 'NewPass123!'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('skips the current-password check entirely for an OAuth-only account (no passwordHash)', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', passwordHash: null });

      await service.changePassword('user-1', 'irrelevant', 'NewPass123!');

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('updates the password hash and revokes all outstanding refresh tokens', async () => {
      const correctHash = await bcrypt.hash('CorrectPass123!', 4);
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', passwordHash: correctHash });

      await service.changePassword('user-1', 'CorrectPass123!', 'NewPass123!');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'password_changed' },
      });
    });
  });
});
