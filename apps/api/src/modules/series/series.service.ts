import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateSeriesDto, UpdateSeriesDto, AssignArticleToSeriesDto } from './dto/series.dto';

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateSeriesDto, organizationId: string) {
    const slug = await this.generateSlug(dto.slug ?? dto.name, organizationId);

    return this.prisma.articleSeries.create({
      data: {
        organizationId,
        name: dto.name,
        slug,
        description: dto.description,
      },
    });
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(organizationId: string) {
    const series = await this.prisma.articleSeries.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { articles: { where: { deletedAt: null } } } } },
    });

    return series.map(({ _count, ...s }) => ({
      ...s,
      articleCount: _count.articles,
    }));
  }

  // ─── Find One (with ordered articles) ──────────────────────────────────────

  async findOne(id: string, organizationId: string) {
    const series = await this.prisma.articleSeries.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        articles: {
          where: { deletedAt: null },
          orderBy: [{ seriesOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            seriesOrder: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!series) {
      throw new NotFoundException('Series not found');
    }

    return series;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSeriesDto, organizationId: string) {
    const existing = await this.findOne(id, organizationId);

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateSlug(dto.slug, organizationId, id);
    } else if (dto.name && dto.name !== existing.name && !dto.slug) {
      slug = await this.generateSlug(dto.name, organizationId, id);
    }

    return this.prisma.articleSeries.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        slug,
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }

  // ─── Delete (Soft) ─────────────────────────────────────────────────────────

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    const articleCount = await this.prisma.article.count({
      where: { seriesId: id, organizationId, deletedAt: null },
    });
    if (articleCount > 0) {
      throw new BadRequestException(
        'Cannot delete a series that still has articles assigned to it. Reassign or remove them first.',
      );
    }

    await this.prisma.articleSeries.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Series deleted' };
  }

  // ─── Assign an article to a series ─────────────────────────────────────────

  async assignArticle(articleId: string, dto: AssignArticleToSeriesDto, organizationId: string) {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId, deletedAt: null },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    if (dto.seriesId) {
      await this.findOne(dto.seriesId, organizationId);
    }

    return this.prisma.article.update({
      where: { id: articleId },
      data: {
        seriesId: dto.seriesId ?? null,
        seriesOrder: dto.seriesId === null ? null : (dto.seriesOrder ?? article.seriesOrder),
      },
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async generateSlug(
    input: string,
    organizationId: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(input, { lower: true, strict: true, trim: true }).substring(0, 240);

    let slug = base;
    let counter = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.articleSeries.findFirst({
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
