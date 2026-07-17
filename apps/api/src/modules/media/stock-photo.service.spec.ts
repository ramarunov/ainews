import { BadRequestException } from '@nestjs/common';
import { StockPhotoService } from './stock-photo.service';

describe('StockPhotoService', () => {
  let service: StockPhotoService;
  let config: any;
  let systemSettings: any;
  let mediaService: any;

  const samplePexelsResponse = {
    photos: [
      {
        id: 123,
        width: 1600,
        height: 1200,
        photographer: 'Jane Doe',
        photographer_url: 'https://pexels.com/@janedoe',
        alt: 'A city skyline',
        src: {
          medium: 'https://images.pexels.com/photos/123/medium.jpg',
          large2x: 'https://images.pexels.com/photos/123/large2x.jpg',
          original: 'https://images.pexels.com/photos/123/original.jpg',
        },
      },
    ],
  };

  beforeEach(() => {
    (global as any).fetch = jest.fn();
    config = { get: jest.fn((_key: string, fallback?: string) => fallback ?? '') };
    systemSettings = { getDecryptedValue: jest.fn().mockResolvedValue(null) };
    mediaService = { upload: jest.fn().mockResolvedValue({ id: 'media-1' }) };
    service = new StockPhotoService(config, systemSettings, mediaService);
  });

  describe('isConfigured / getApiKey resolution', () => {
    it('is not configured when neither the DB key nor the env var is set', async () => {
      expect(await service.isConfigured()).toBe(false);
    });

    it('is configured when a DB-stored key exists', async () => {
      systemSettings.getDecryptedValue.mockResolvedValue('db-key-123');
      expect(await service.isConfigured()).toBe(true);
    });

    it('falls back to the env var when no DB key is configured', async () => {
      config.get.mockImplementation((key: string, fallback?: string) =>
        key === 'PEXELS_API_KEY' ? 'env-key-456' : (fallback ?? ''),
      );
      expect(await service.isConfigured()).toBe(true);
    });
  });

  describe('search', () => {
    it('throws BadRequestException without ever calling fetch when no key is configured', async () => {
      await expect(service.search('business')).rejects.toThrow(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('queries Pexels with the API key and maps the response shape', async () => {
      systemSettings.getDecryptedValue.mockResolvedValue('real-key');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(samplePexelsResponse),
      });

      const results = await service.search('business finance', 3);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('query=business%20finance'),
        expect.objectContaining({ headers: { Authorization: 'real-key' } }),
      );
      expect(results).toEqual([
        {
          id: '123',
          thumbnailUrl: samplePexelsResponse.photos[0].src.medium,
          fullUrl: samplePexelsResponse.photos[0].src.large2x,
          width: 1600,
          height: 1200,
          photographer: 'Jane Doe',
          photographerUrl: 'https://pexels.com/@janedoe',
          alt: 'A city skyline',
        },
      ]);
    });

    it('throws BadRequestException when Pexels responds with a non-2xx status', async () => {
      systemSettings.getDecryptedValue.mockResolvedValue('real-key');
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });

      await expect(service.search('business')).rejects.toThrow(BadRequestException);
    });
  });

  describe('downloadAndAttach', () => {
    const result = {
      fullUrl: 'https://images.pexels.com/photos/123/large2x.jpg',
      photographer: 'Jane Doe',
      alt: 'A city skyline',
    };

    it('downloads the image and uploads it via MediaService with a stock-photos folder', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
        headers: { get: () => 'image/jpeg' },
      });

      const media = await service.downloadAndAttach(result, 'user-1', 'org-1');

      expect(mediaService.upload).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: 'image/jpeg', size: 3 }),
        'user-1',
        'org-1',
        expect.objectContaining({ folder: 'stock-photos', altText: 'A city skyline' }),
      );
      expect(media).toEqual({ id: 'media-1' });
    });

    it('throws BadRequestException when the download fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });

      await expect(service.downloadAndAttach(result, 'user-1', 'org-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mediaService.upload).not.toHaveBeenCalled();
    });
  });

  describe('autoAttachForQuery', () => {
    it('returns null without throwing when no API key is configured', async () => {
      const outcome = await service.autoAttachForQuery('business finance', 'user-1', 'org-1');
      expect(outcome).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns null without throwing when the search returns no results', async () => {
      systemSettings.getDecryptedValue.mockResolvedValue('real-key');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ photos: [] }),
      });

      const outcome = await service.autoAttachForQuery('an obscure query', 'user-1', 'org-1');
      expect(outcome).toBeNull();
    });

    it('returns null without throwing when the download step fails unexpectedly', async () => {
      systemSettings.getDecryptedValue.mockResolvedValue('real-key');
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(samplePexelsResponse) })
        .mockRejectedValueOnce(new Error('network blip'));

      const outcome = await service.autoAttachForQuery('business finance', 'user-1', 'org-1');
      expect(outcome).toBeNull();
    });

    it('searches, downloads, and attaches the first result on success', async () => {
      systemSettings.getDecryptedValue.mockResolvedValue('real-key');
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(samplePexelsResponse) })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
          headers: { get: () => 'image/jpeg' },
        });

      const outcome = await service.autoAttachForQuery('business finance', 'user-1', 'org-1');

      expect(outcome).toEqual({ id: 'media-1' });
      expect(mediaService.upload).toHaveBeenCalledTimes(1);
    });
  });
});
