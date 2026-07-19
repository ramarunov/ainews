import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';

jest.mock('sharp', () => {
  return jest.fn();
});

jest.mock('file-type', () => ({
  fromBuffer: jest.fn(),
}));

import sharp from 'sharp';
import { fromBuffer } from 'file-type';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: any;
  let storageService: any;
  let eventEmitter: any;
  let aiWriter: any;

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
    // Matches baseFile()'s claimed 'image/png' by default — individual
    // tests override this to simulate a mismatch between the claimed
    // mimetype and the file's real sniffed content.
    (fromBuffer as jest.Mock).mockResolvedValue({ ext: 'png', mime: 'image/png' });

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
    aiWriter = { generateAltText: jest.fn() };
    service = new MediaService(prisma, storageService, eventEmitter, aiWriter);
  });

  describe('upload', () => {
    it('rejects when no file is provided', async () => {
      await expect(
        service.upload(undefined as any, 'user-1', 'org-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a file whose real (sniffed) content type is unsupported', async () => {
      (fromBuffer as jest.Mock).mockResolvedValue({ ext: 'exe', mime: 'application/x-msdownload' });
      const file = baseFile();

      await expect(service.upload(file, 'user-1', 'org-1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('rejects a file whose content type cannot be recognized at all', async () => {
      (fromBuffer as jest.Mock).mockResolvedValue(undefined);
      const file = baseFile();

      await expect(service.upload(file, 'user-1', 'org-1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('rejects based on the real sniffed content even when the client claims an allowed mimetype', async () => {
      // The classic disguised-upload attack: claim "image/png" in the
      // multipart Content-Type while the actual bytes are something else
      // entirely - the claimed mimetype must never be trusted on its own.
      (fromBuffer as jest.Mock).mockResolvedValue({ ext: 'html', mime: 'text/html' });
      const file = baseFile({ mimetype: 'image/png' });

      await expect(service.upload(file, 'user-1', 'org-1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('stores the sniffed content type, not the client-claimed one, when they differ', async () => {
      (fromBuffer as jest.Mock).mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' });
      prisma.mediaFile.create.mockResolvedValue({ id: 'media-4' });

      const file = baseFile({ mimetype: 'image/png', originalname: 'doc.pdf' });
      await service.upload(file, 'user-1', 'org-1', {});

      expect(storageService.upload).toHaveBeenCalledWith(
        file.buffer,
        expect.objectContaining({ contentType: 'application/pdf' }),
      );
      expect(prisma.mediaFile.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mimeType: 'application/pdf' }) }),
      );
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
      (fromBuffer as jest.Mock).mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' });
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

  describe('generateAltText', () => {
    it('rejects a non-image file', async () => {
      prisma.mediaFile.findFirst.mockResolvedValue({
        id: 'media-1',
        mimeType: 'application/pdf',
      });

      await expect(service.generateAltText('media-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(aiWriter.generateAltText).not.toHaveBeenCalled();
    });

    it('rejects a file with no public URL', async () => {
      prisma.mediaFile.findFirst.mockResolvedValue({
        id: 'media-1',
        mimeType: 'image/png',
        publicUrl: null,
      });

      await expect(service.generateAltText('media-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(aiWriter.generateAltText).not.toHaveBeenCalled();
    });

    it('generates alt text via AI and saves it', async () => {
      prisma.mediaFile.findFirst.mockResolvedValue({
        id: 'media-1',
        mimeType: 'image/png',
        publicUrl: 'https://cdn/photo.png',
        caption: 'A press conference',
      });
      aiWriter.generateAltText.mockResolvedValue('A speaker at a podium addressing reporters');
      prisma.mediaFile.update.mockResolvedValue({
        id: 'media-1',
        altText: 'A speaker at a podium addressing reporters',
      });

      const result = await service.generateAltText('media-1', 'org-1');

      expect(aiWriter.generateAltText).toHaveBeenCalledWith('https://cdn/photo.png', {
        caption: 'A press conference',
        organizationId: 'org-1',
      });
      expect(prisma.mediaFile.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { altText: 'A speaker at a podium addressing reporters' },
      });
      expect(result.altText).toBe('A speaker at a podium addressing reporters');
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
