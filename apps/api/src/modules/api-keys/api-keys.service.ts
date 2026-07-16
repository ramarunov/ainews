import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateApiKeyDto } from './dto/api-key.dto';

const KEY_PREFIX = 'ak_';
const PREFIX_DISPLAY_LENGTH = 12; // "ak_" + 9 hex chars - enough to identify a key in a list, not enough to brute-force.

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

const LIST_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  permissions: true,
  rateLimit: true,
  lastUsedAt: true,
  expiresAt: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The full plaintext key is only ever returned here, at creation time -
   * afterwards only keyHash (never reversible) is stored, matching how
   * password/refresh-token secrets are handled everywhere else in this app.
   */
  async create(dto: CreateApiKeyDto, userId: string, organizationId: string) {
    const rawKey = `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, PREFIX_DISPLAY_LENGTH);
    const keyHash = hashKey(rawKey);

    const created = await this.prisma.apiKey.create({
      data: {
        organizationId,
        userId,
        name: dto.name,
        keyPrefix,
        keyHash,
        permissions: dto.permissions ?? [],
        rateLimit: dto.rateLimit ?? 1000,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      select: LIST_SELECT,
    });

    return { ...created, key: rawKey };
  }

  findAll(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId, deletedAt: null },
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string, organizationId: string): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!key) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  /**
   * Looks a raw "ak_..." key up by its hash - deliberately NOT scoped by
   * organizationId (that's the very thing this determines). api_keys was
   * excluded from RLS for exactly this reason; see
   * 20260716103000_rls_exclude_api_keys/migration.sql.
   */
  async validateKey(rawKey: string) {
    if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;

    // Deliberately not carrying the underlying user's isSuperadmin flag
    // through - a revocable API key's own declared `permissions` array is
    // the entire authorization surface for key-based requests, never an
    // implicit admin bypass, even if the owning user happens to be one.
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashKey(rawKey) },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        permissions: true,
        rateLimit: true,
        isActive: true,
        expiresAt: true,
        deletedAt: true,
      },
    });

    if (!key || !key.isActive || key.deletedAt) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;

    this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return key;
  }
}
