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
      },
    };

    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    config = { get: jest.fn((_key: string, fallback?: any) => fallback) };
    eventEmitter = { emit: jest.fn() };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      multi: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
      del: jest.fn().mockResolvedValue(1),
    };

    service = new AuthService(
      prisma,
      {} as any, // UsersService is unused by the methods under test
      jwtService,
      config,
      eventEmitter,
      redis,
      new EncryptionService(config),
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
});
