import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';

jest.mock('sharp', () => {
  return jest.fn();
});

import sharp from 'sharp';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: any;
  let storageService: any;
  let eventEmitter: any;

  const baseFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({
      buffer: Buffer.from('fake-bytes'),
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 1024,
      ...overrides,
    }) as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      mediaFile: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    storageService = {
      upload: jest.fn().mockResolvedValue({ key: 'org-1/media/file.png', bucket: 'ainews-media', url: 'https://cdn/file.png' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    eventEmitter = { emit: jest.fn() };
    service = new MediaService(prisma, storageService, eventEmitter);
  });

  describe('upload', () => {
    it('rejects when no file is provided', async () => {
      await expect(
        service.upload(undefined as any, 'user-1', 'org-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unsupported mime type', async () => {
      const file = baseFile({ mimetype: 'text/x-executable' });

      await expect(service.upload(file, 'user-1', 'org-1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('generates a thumbnail variant for a valid image and stores the record', async () => {
      const resizeChain = {
        resize: jest.fn().mockReturnThis(),
        webp: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumb')),
        metadata: jest.fn(),
      };
      (sharp as unknown as jest.Mock).mockReturnValue({
        metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
        resize: resizeChain.resize,
      });
      resizeChain.resize.mockReturnValue(resizeChain);

      storageService.upload
        .mockResolvedValueOnce({ key: 'org-1/media/thumbnails/photo.webp', bucket: 'b', url: 'https://cdn/thumb.webp' })
        .mockResolvedValueOnce({ key: 'org-1/media/photo.png', bucket: 'b', url: 'https://cdn/photo.png' });

      const created = { id: 'media-1' };
      prisma.mediaFile.create.mockResolvedValue(created);

      const file = baseFile();
      const result = await service.upload(file, 'user-1', 'org-1', {});

      expect(storageService.upload).toHaveBeenCalledTimes(2); // thumbnail + original
      expect(prisma.mediaFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            uploadedBy: 'user-1',
            mimeType: 'image/png',
            width: 800,
            height: 600,
            fileSize: BigInt(file.size),
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'media.uploaded',
        expect.objectContaining({ mediaId: 'media-1' }),
      );
      expect(result).toBe(created);
    });

    it('still stores the original file when sharp fails on a corrupt image', async () => {
      (sharp as unknown as jest.Mock).mockReturnValue({
        metadata: jest.fn().mockRejectedValue(new Error('corrupt image data')),
      });
      prisma.mediaFile.create.mockResolvedValue({ id: 'media-2' });

      const file = baseFile();
      await service.upload(file, 'user-1', 'org-1', {});

      // Only the original upload happens — no thumbnail — and the request
      // still succeeds instead of throwing.
      expect(storageService.upload).toHaveBeenCalledTimes(1);
      expect(prisma.mediaFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ width: undefined, height: undefined }),
        }),
      );
    });

    it('skips image processing entirely for non-image uploads', async () => {
      prisma.mediaFile.create.mockResolvedValue({ id: 'media-3' });

      const file = baseFile({ mimetype: 'application/pdf', originalname: 'doc.pdf' });
      await service.upload(file, 'user-1', 'org-1', {});

      expect(sharp).not.toHaveBeenCalled();
      expect(storageService.upload).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of soft-deleting a missing file', async () => {
      prisma.mediaFile.findFirst.mockResolvedValue(null);

      await expect(service.remove('missing', 'org-1')).rejects.toThrow(NotFoundException);
      expect(prisma.mediaFile.update).not.toHaveBeenCalled();
    });

    it('soft-deletes and emits media.deleted', async () => {
      prisma.mediaFile.findFirst.mockResolvedValue({ id: 'media-1' });
      prisma.mediaFile.update.mockResolvedValue({});

      const result = await service.remove('media-1', 'org-1');

      expect(prisma.mediaFile.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'media.deleted',
        expect.objectContaining({ mediaId: 'media-1' }),
      );
      expect(result).toEqual({ success: true, message: 'Media file deleted' });
    });
  });

  describe('purge', () => {
    it('deletes from storage and hard-deletes the DB row', async () => {
      prisma.mediaFile.findFirst.mockResolvedValue({ id: 'media-1', storageKey: 'org-1/media/x.png' });
      prisma.mediaFile.delete.mockResolvedValue({});

      await service.purge('media-1', 'org-1');

      expect(storageService.delete).toHaveBeenCalledWith('org-1/media/x.png');
      expect(prisma.mediaFile.delete).toHaveBeenCalledWith({ where: { id: 'media-1' } });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'media.purged',
        expect.objectContaining({ mediaId: 'media-1' }),
      );
    });

    it('throws NotFoundException without touching storage when the file record is missing', async () => {
      prisma.mediaFile.findFirst.mockResolvedValue(null);

      await expect(service.purge('missing', 'org-1')).rejects.toThrow(NotFoundException);
      expect(storageService.delete).not.toHaveBeenCalled();
    });
  });
});
