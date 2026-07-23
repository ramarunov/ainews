import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { sanitizeArticleHtml } from '../../common/sanitize-html';
import { CreatePageDto, UpdatePageDto, PageQueryDto, RESERVED_PAGE_SLUGS } from './dto/page.dto';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePageDto, organizationId: string) {
    const slug = await this.generateSlug(dto.slug ?? dto.title, organizationId);

    const page = await this.prisma.page.create({
      data: {
        organizationId,
        title: dto.title,
        slug,
        content: sanitizeArticleHtml(dto.content ?? ''),
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        isPublished: dto.isPublished ?? false,
      },
    });

    return page;
  }

  async findAll(query: PageQueryDto, organizationId: string) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 50);
    const skip = (page - 1) * limit;

    const where = { organizationId, deletedAt: null };

    const [pages, total] = await Promise.all([
      this.prisma.page.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
      }),
      this.prisma.page.count({ where }),
    ]);

    return {
      data: pages,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, organizationId: string) {
    const page = await this.prisma.page.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return page;
  }

  async findBySlug(slug: string, organizationId: string) {
    const page = await this.prisma.page.findFirst({
      where: { slug, organizationId, deletedAt: null },
    });

    if (!page) {
      throw new NotFoundException(`Page with slug "${slug}" not found`);
    }

    return page;
  }

  async update(id: string, dto: UpdatePageDto, organizationId: string) {
    const existing = await this.findOne(id, organizationId);

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateSlug(dto.slug, organizationId, id);
    } else if (dto.title && dto.title !== existing.title && !dto.slug) {
      slug = await this.generateSlug(dto.title, organizationId, id);
    }

    const updated = await this.prisma.page.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        slug,
        ...(dto.content !== undefined && { content: sanitizeArticleHtml(dto.content) }),
        ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle }),
        ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
      },
    });

    return updated;
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    await this.prisma.page.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Page deleted' };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async generateSlug(
    input: string,
    organizationId: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(input, {
      lower: true,
      strict: true,
      trim: true,
    }).substring(0, 240);

    if (RESERVED_PAGE_SLUGS.includes(base)) {
      throw new BadRequestException(
        `"${base}" is a reserved path and cannot be used as a page slug`,
      );
    }

    let slug = base;
    let counter = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.page.findFirst({
        where: {
          organizationId,
          slug,
          deletedAt: null,
          ...(excludeId && { id: { not: excludeId } }),
        },
      });

      if (!existing) break;
      slug = `${base}-${counter++}`;
    }

    return slug;
  }
}
