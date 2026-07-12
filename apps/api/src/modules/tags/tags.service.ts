import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import slugify from 'slugify';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateTagDto, UpdateTagDto, TagQueryDto } from './dto/tag.dto';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateTagDto, organizationId: string) {
    const slug = await this.generateSlug(dto.name, organizationId);

    const tag = await this.prisma.tag.create({
      data: {
        organizationId,
        name: dto.name,
        slug,
        description: dto.description,
        color: dto.color,
      },
    });

    this.eventEmitter.emit('tag.created', {
      tagId: tag.id,
      organizationId,
    });

    return tag;
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(query: TagQueryDto, organizationId: string) {
    const { search, page = 1, limit = 20 } = query;

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const where: Prisma.TagWhereInput = {
      organizationId,
      deletedAt: null,
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    const [tags, total] = await Promise.all([
      this.prisma.tag.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.tag.count({ where }),
    ]);

    return {
      data: tags,
      meta: { total, page: Math.max(1, page), limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(id: string, organizationId: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  // ─── Find or Create by Names (helper, no route) ───────────────────────────

  async findOrCreateByNames(names: string[], organizationId: string) {
    const uniqueNames = Array.from(
      new Set(names.map((name) => name.trim()).filter((name) => name.length > 0)),
    );

    if (uniqueNames.length === 0) {
      return [];
    }

    const existingTags = await this.prisma.tag.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: uniqueNames.map((name) => ({ name: { equals: name, mode: 'insensitive' } })),
      },
    });

    const existingNamesLower = new Set(existingTags.map((tag) => tag.name.toLowerCase()));
    const namesToCreate = uniqueNames.filter(
      (name) => !existingNamesLower.has(name.toLowerCase()),
    );

    const createdTags = [];
    for (const name of namesToCreate) {
      const slug = await this.generateSlug(name, organizationId);
      const tag = await this.prisma.tag.create({
        data: { organizationId, name, slug },
      });
      this.eventEmitter.emit('tag.created', { tagId: tag.id, organizationId });
      createdTags.push(tag);
    }

    return [...existingTags, ...createdTags];
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateTagDto, organizationId: string) {
    const existing = await this.findOne(id, organizationId);

    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = await this.generateSlug(dto.name, organizationId, id);
    }

    const updated = await this.prisma.tag.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        slug,
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });

    this.eventEmitter.emit('tag.updated', {
      tagId: id,
      organizationId,
    });

    return updated;
  }

  // ─── Delete (Soft) ─────────────────────────────────────────────────────────

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    await this.prisma.$transaction([
      this.prisma.articleTag.deleteMany({ where: { tagId: id } }),
      this.prisma.tag.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);

    this.eventEmitter.emit('tag.deleted', {
      tagId: id,
      organizationId,
    });

    return { success: true, message: 'Tag deleted' };
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
    }).substring(0, 90);

    let slug = base;
    let counter = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.tag.findFirst({
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
