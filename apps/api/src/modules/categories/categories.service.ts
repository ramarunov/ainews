import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { withOrgTransaction } from '../../infrastructure/prisma/rls-extension';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
  RESERVED_SUBDOMAINS,
} from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Best-effort lookup for callers that only have a free-text hint (e.g.
  // NewsSource.categoryHint / NewsItem.category) rather than a real
  // categoryId - slugifies the hint and matches it against this org's
  // current categories. Used by both the autonomous publishing pipeline and
  // manual draft creation from a news item, so a hint that matches one
  // resolves the same way regardless of which path created the article.
  async resolveByHint(categoryHint: string | null | undefined, organizationId: string): Promise<string | null> {
    if (!categoryHint) return null;
    try {
      const category = await this.findBySlug(slugify(categoryHint, { lower: true }), organizationId);
      return category.id;
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      return null;
    }
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateCategoryDto, organizationId: string) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, organizationId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Parent category not found');
      }
    }

    const slug = await this.generateSlug(dto.slug ?? dto.name, organizationId);

    if (dto.subdomain) {
      await this.assertSubdomainAvailable(dto.subdomain, organizationId);
    }

    const category = await this.prisma.category.create({
      data: {
        organizationId,
        parentId: dto.parentId,
        name: dto.name,
        slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        subdomain: dto.subdomain,
        sortOrder: dto.sortOrder ?? 0,
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.eventEmitter.emit('category.created', {
      categoryId: category.id,
      organizationId,
    });

    return category;
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(query: CategoryQueryDto, organizationId: string) {
    const { parentId, flat, page = 1, limit = 20 } = query;

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    if (flat) {
      const where: Prisma.CategoryWhereInput = {
        organizationId,
        deletedAt: null,
        ...(parentId !== undefined && {
          parentId: parentId === 'null' ? null : parentId,
        }),
      };

      const [categories, total] = await Promise.all([
        this.prisma.category.findMany({
          where,
          skip,
          take,
          orderBy: { sortOrder: 'asc' },
        }),
        this.prisma.category.count({ where }),
      ]);

      return {
        data: categories,
        meta: { total, page: Math.max(1, page), limit: take, totalPages: Math.ceil(total / take) },
      };
    }

    const resolvedParentId = parentId === undefined || parentId === 'null' ? null : parentId;
    const where: Prisma.CategoryWhereInput = {
      organizationId,
      deletedAt: null,
      parentId: resolvedParentId,
    };

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take,
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data: categories,
      meta: { total, page: Math.max(1, page), limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(id: string, organizationId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        parent: true,
        children: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async findBySlug(slug: string, organizationId: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, organizationId, deletedAt: null },
      include: {
        parent: true,
        children: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    return category;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateCategoryDto, organizationId: string) {
    const existing = await this.findOne(id, organizationId);

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }

      const parent = await this.prisma.category.findFirst({
        where: { id: dto.parentId, organizationId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Parent category not found');
      }

      await this.assertNoCycle(id, dto.parentId, organizationId);
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      slug = await this.generateSlug(dto.slug, organizationId, id);
    } else if (dto.name && dto.name !== existing.name && !dto.slug) {
      slug = await this.generateSlug(dto.name, organizationId, id);
    }

    if (dto.subdomain !== undefined && dto.subdomain !== existing.subdomain) {
      if (dto.subdomain) {
        await this.assertSubdomainAvailable(dto.subdomain, organizationId, id);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        slug,
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle }),
        ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription }),
        // dto.subdomain === "" (cleared in the admin form) intentionally
        // nulls it out - only `undefined` (field omitted) leaves it alone.
        ...(dto.subdomain !== undefined && { subdomain: dto.subdomain || null }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        parent: true,
        children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });

    this.eventEmitter.emit('category.updated', {
      categoryId: id,
      organizationId,
    });

    return updated;
  }

  // ─── Delete (Permanent) ────────────────────────────────────────────────────

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    const childCount = await this.prisma.category.count({
      where: { parentId: id, organizationId, deletedAt: null },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        'Cannot delete a category that has active subcategories. Remove or reassign its children first.',
      );
    }

    const articleCount = await this.prisma.article.count({
      where: { primaryCategoryId: id, organizationId, deletedAt: null },
    });
    if (articleCount > 0) {
      throw new BadRequestException(
        'Cannot delete a category that is used as the primary category of one or more articles.',
      );
    }

    await withOrgTransaction(this.prisma, async (tx) => {
      // Category.parent and Article.primaryCategory both point at Category
      // with no onDelete (Postgres default RESTRICT), so a stray reference
      // from a row that's itself already invisible - a soft-deleted
      // subcategory, or a trashed article - would otherwise block this
      // hard-delete with no way for an admin to even see, let alone fix,
      // the culprit. Both guards above already refuse to delete while an
      // ACTIVE child/article still depends on this category; these two
      // cleanups only touch rows nobody can act on anymore anyway.
      await tx.category.updateMany({
        where: { parentId: id, deletedAt: { not: null } },
        data: { parentId: null },
      });
      await tx.article.updateMany({
        where: { primaryCategoryId: id, deletedAt: { not: null } },
        data: { primaryCategoryId: null },
      });
      // ArticleCategory rows for this category cascade automatically
      // (onDelete: Cascade in schema.prisma).
      await tx.category.delete({ where: { id } });
    });

    this.eventEmitter.emit('category.deleted', {
      categoryId: id,
      organizationId,
    });

    return { success: true, message: 'Category deleted' };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async assertNoCycle(id: string, newParentId: string, organizationId: string): Promise<void> {
    let cursor: string | null = newParentId;

    while (cursor) {
      if (cursor === id) {
        throw new BadRequestException(
          'Cannot set parent to a descendant of this category (would create a cycle)',
        );
      }

      const node: { parentId: string | null } | null = await this.prisma.category.findFirst({
        where: { id: cursor, organizationId },
        select: { parentId: true },
      });

      cursor = node?.parentId ?? null;
    }
  }

  // Unlike generateSlug's auto-suffix-on-collision behavior, a colliding
  // subdomain is a hard rejection (400) - it's a public-facing hostname a
  // human deliberately chose, so silently renaming it to something else
  // would be surprising, not helpful.
  private async assertSubdomainAvailable(
    subdomain: string,
    organizationId: string,
    excludeId?: string,
  ): Promise<void> {
    if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      throw new BadRequestException(`"${subdomain}" is a reserved subdomain and cannot be used`);
    }

    const existing = await this.prisma.category.findFirst({
      where: {
        organizationId,
        subdomain,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });

    if (existing) {
      throw new BadRequestException(`Subdomain "${subdomain}" is already in use`);
    }
  }

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

    let slug = base;
    let counter = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Deliberately NOT filtering deletedAt: null here - the DB unique
      // constraint (organizationId, slug) applies to soft-deleted rows too,
      // so a slug "freed up" by a deleted category is still taken as far as
      // Postgres is concerned. Checking only active categories let this
      // pick a slug that then failed with an unhandled P2002 at create().
      const existing = await this.prisma.category.findFirst({
        where: {
          organizationId,
          slug,
          ...(excludeId && { id: { not: excludeId } }),
        },
      });

      if (!existing) break;
      slug = `${base}-${counter++}`;
    }

    return slug;
  }
}
