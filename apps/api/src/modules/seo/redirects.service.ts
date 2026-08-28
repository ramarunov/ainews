import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateRedirectDto, UpdateRedirectDto } from './dto/redirect.dto';

// Automated vulnerability / CMS scanners hit every public domain with requests
// for files a news site never serves — a fresh rusdimedia.com deploy logged
// 4,798 hits on /xmlrpc.php in a single day, and ~400 of ~640 NotFoundLog rows
// were probes like /wp-login.php, /.env, /2.php. Recording these buries the
// handful of genuine content misses the 404 monitor exists to surface, so
// resolve() recognises and drops them instead of writing a row. Deliberately
// conservative: only unambiguous probe shapes, nothing that could collide with
// a real article / page / category slug.
const SCANNER_PATH_PATTERN =
  /\.(php\d?|phtml|aspx?|jsp|cgi|pl|env|git|sql|bak|old|ini|sh|yml|yaml)(\/|\?|$)|(^|\/)(wp-|wp\/|xmlrpc|wlwmanifest|phpmyadmin|adminer|mysqladmin|\.env|\.git|\.aws|\.ssh|vendor\/|cgi-bin\/)/i;

// A second, distinct noise class the scanner pattern above misses: spam / SEO
// crawlers replaying huge canned URL lists (eBay category names like
// /Coins___Paper_Money, /Pottery___Glass, /sports_mem__cards___fan_shop;
// SaaS-template paths like /pricing-plans-modal, /curated_guides,
// /hand_picked_lists) and bots working Google's stale index of the old
// WordPress site (/2025/page/157 date archives). None of these are links this
// site emits. Two shapes catch essentially all of it with no risk to real
// content: (1) an uppercase letter or underscore anywhere — every real
// article / page / category / tag slug in this DB is strictly kebab-case
// [a-z0-9-] (the only two underscore slugs, browser-error articles like
// dns_probe_finished_nxdomain, still serve on exact match, and any redirect is
// resolved before this check ever runs); (2) a leading 4-digit year segment,
// which is only ever a WordPress /YYYY/... date-archive crawl.
const SPAM_CRAWLER_PATH_PATTERN = /[A-Z_]|^\/\d{4}(\/|$)/;

function isUnloggableProbe(path: string): boolean {
  return SCANNER_PATH_PATTERN.test(path) || SPAM_CRAWLER_PATH_PATTERN.test(path);
}

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

    // A redirect an editor adds for a junk path is still honoured above; we
    // just don't pollute the 404 monitor with the scan traffic itself.
    if (!isUnloggableProbe(path)) {
      await this.prisma.notFoundLog.upsert({
        where: { organizationId_path: { organizationId, path } },
        create: { organizationId, path, referrer },
        update: {
          hitCount: { increment: 1 },
          lastSeenAt: new Date(),
          ...(referrer !== undefined && { referrer }),
        },
      });
    }

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
