import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateRedirectDto, UpdateRedirectDto } from './dto/redirect.dto';

@Injectable()
export class RedirectsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Redirects (SEO-013) ────────────────────────────────────────────────────

  async create(dto: CreateRedirectDto, organizationId: string, createdBy: string) {
    const existing = await this.prisma.redirect.findUnique({
      where: { organizationId_fromPath: { organizationId, fromPath: dto.fromPath } },
    });
    if (existing) {
      throw new ConflictException(`A redirect from "${dto.fromPath}" already exists`);
    }

    return this.prisma.redirect.create({
      data: {
        organizationId,
        fromPath: dto.fromPath,
        toUrl: dto.toUrl,
        statusCode: dto.statusCode ?? 301,
        note: dto.note,
        createdBy,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.redirect.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const redirect = await this.prisma.redirect.findFirst({
      where: { id, organizationId },
    });
    if (!redirect) {
      throw new NotFoundException('Redirect not found');
    }
    return redirect;
  }

  async update(id: string, dto: UpdateRedirectDto, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.redirect.update({
      where: { id },
      data: {
        ...(dto.toUrl !== undefined && { toUrl: dto.toUrl }),
        ...(dto.statusCode !== undefined && { statusCode: dto.statusCode }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    await this.prisma.redirect.delete({ where: { id } });
    return { success: true, message: 'Redirect deleted' };
  }

  // ─── Resolve (used by the public site before it gives up and 404s) ────────

  /**
   * Looks up an active redirect for `path`. If none exists, records the
   * miss in NotFoundLog (SEO-014's 404 monitor data source) instead —
   * either way, this always returns a definite answer so the public site
   * needs exactly one call per unresolved request.
   */
  async resolve(path: string, organizationId: string, referrer?: string) {
    const redirect = await this.prisma.redirect.findFirst({
      where: { organizationId, fromPath: path, isActive: true },
    });

    if (redirect) {
      await this.prisma.redirect.update({
        where: { id: redirect.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      });
      return { toUrl: redirect.toUrl, statusCode: redirect.statusCode };
    }

    await this.prisma.notFoundLog.upsert({
      where: { organizationId_path: { organizationId, path } },
      create: { organizationId, path, referrer },
      update: {
        hitCount: { increment: 1 },
        lastSeenAt: new Date(),
        ...(referrer !== undefined && { referrer }),
      },
    });

    return null;
  }

  // ─── 404 Monitor (SEO-014) ──────────────────────────────────────────────────

  async listNotFoundLogs(organizationId: string, resolved = false) {
    return this.prisma.notFoundLog.findMany({
      where: { organizationId, resolved },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
  }

  async dismissNotFoundLog(id: string, organizationId: string) {
    const log = await this.prisma.notFoundLog.findFirst({ where: { id, organizationId } });
    if (!log) {
      throw new NotFoundException('Not-found log entry not found');
    }

    return this.prisma.notFoundLog.update({
      where: { id },
      data: { resolved: true },
    });
  }
}
