import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { basename, extname } from 'path';
import sharp from 'sharp';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AIWriterService } from '../ai/ai-writer.service';
import { UpdateMediaDto, MediaQueryDto } from './dto/media.dto';

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'application/', 'audio/'];

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly aiWriter: AIWriterService,
  ) {}

  // ─── Upload ────────────────────────────────────────────────────────────────

  async upload(
    file: Express.Multer.File,
    uploaderId: string,
    organizationId: string,
    meta: { folder?: string; altText?: string; caption?: string },
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix))) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const folder = meta.folder ?? 'media';
    const isImage = file.mimetype.startsWith('image/');

    let width: number | undefined;
    let height: number | undefined;
    const variants: Record<string, string> = {};

    if (isImage) {
      try {
        const metadata = await sharp(file.buffer).metadata();
        width = metadata.width;
        height = metadata.height;

        const thumbnailBuffer = await sharp(file.buffer)
          .resize({ width: 400, withoutEnlargement: true })
          .webp()
          .toBuffer();

        const thumbnail = await this.storageService.upload(thumbnailBuffer, {
          folder: `${folder}/thumbnails`,
          filename: `${basename(file.originalname, extname(file.originalname))}.webp`,
          contentType: 'image/webp',
          organizationId,
        });

        variants.thumbnail = thumbnail.url;
      } catch {
        // Unsupported/corrupt image for sharp — skip variant generation, keep original only.
      }
    }

    const original = await this.storageService.upload(file.buffer, {
      folder,
      filename: file.originalname,
      contentType: file.mimetype,
      organizationId,
    });

    const mediaFile = await this.prisma.mediaFile.create({
      data: {
        organizationId,
        uploadedBy: uploaderId,
        filename: basename(original.key),
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        storageKey: original.key,
        storageBucket: original.bucket,
        publicUrl: original.url,
        width,
        height,
        altText: meta.altText,
        caption: meta.caption,
        folder,
        variants: variants as Prisma.InputJsonValue,
      },
    });

    this.eventEmitter.emit('media.uploaded', {
      mediaId: mediaFile.id,
      organizationId,
      uploaderId,
    });

    return mediaFile;
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(query: MediaQueryDto, organizationId: string) {
    const { folder, type, search, page = 1, limit = 20 } = query;

    const skip = (Math.max(1, page) - 1) * Math.min(100, limit);
    const take = Math.min(100, limit);

    const where: Prisma.MediaFileWhereInput = {
      organizationId,
      deletedAt: null,
      ...(folder && { folder }),
      ...(type && { mimeType: { startsWith: `${type}/` } }),
      ...(search && {
        OR: [
          { filename: { contains: search, mode: 'insensitive' } },
          { altText: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.mediaFile.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mediaFile.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: Math.max(1, page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(id: string, organizationId: string) {
    const media = await this.prisma.mediaFile.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!media) {
      throw new NotFoundException('Media file not found');
    }

    return media;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateMediaDto, organizationId: string) {
    await this.findOne(id, organizationId);

    return this.prisma.mediaFile.update({
      where: { id },
      data: {
        ...(dto.altText !== undefined && { altText: dto.altText }),
        ...(dto.caption !== undefined && { caption: dto.caption }),
        ...(dto.folder !== undefined && { folder: dto.folder }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
    });
  }

  // ─── AI Alt Text (MED-005) ──────────────────────────────────────────────────

  async generateAltText(id: string, organizationId: string) {
    const media = await this.findOne(id, organizationId);

    if (!media.mimeType.startsWith('image/')) {
      throw new BadRequestException('Alt text generation is only supported for images');
    }
    if (!media.publicUrl) {
      throw new BadRequestException('This file has no publicly reachable URL to analyze');
    }

    const altText = await this.aiWriter.generateAltText(media.publicUrl, {
      caption: media.caption ?? undefined,
      organizationId,
    });

    return this.update(id, { altText }, organizationId);
  }

  // ─── Delete (Soft) ─────────────────────────────────────────────────────────

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    await this.prisma.mediaFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.eventEmitter.emit('media.deleted', { mediaId: id, organizationId });

    return { success: true, message: 'Media file deleted' };
  }

  // ─── Purge (Hard Delete) ───────────────────────────────────────────────────
  // Not exposed via a controller route yet — kept for later use (e.g. a
  // scheduled cleanup job) once soft-deleted files pass a retention window.

  async purge(id: string, organizationId: string) {
    const media = await this.prisma.mediaFile.findFirst({
      where: { id, organizationId },
    });

    if (!media) {
      throw new NotFoundException('Media file not found');
    }

    await this.storageService.delete(media.storageKey);
    await this.prisma.mediaFile.delete({ where: { id } });

    this.eventEmitter.emit('media.purged', { mediaId: id, organizationId });

    return { success: true, message: 'Media file purged' };
  }
}
