import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MEDIA_PROVIDER_SETTING_KEYS } from '../system-settings/system-settings.constants';
import { MediaService } from './media.service';

export interface StockPhotoResult {
  id: string;
  thumbnailUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string | null;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  photographer_url: string;
  alt: string | null;
  src: { medium: string; large2x: string; original: string };
}

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

// downloadAndAttach() is reachable directly via POST /media/stock-photos/attach
// with a client-supplied fullUrl (@IsUrl() alone only checks it's a
// well-formed URL, not that it's actually a Pexels one) - without this
// allowlist, an authenticated media:write user could make the server fetch
// an arbitrary internal address (e.g. a cloud metadata endpoint) and the
// response would be stored as a viewable MediaFile. Pexels always serves
// photo assets from this CDN host.
const ALLOWED_PHOTO_HOSTS = new Set(['images.pexels.com']);

function assertAllowedPhotoUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid photo URL');
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_PHOTO_HOSTS.has(parsed.hostname)) {
    throw new BadRequestException('Photo URL must be an https://images.pexels.com link');
  }
}

/**
 * Sources real (not AI-generated) photos for article featured images via
 * the Pexels API - see the discussion in this session for why: an
 * AI-generated "photo" attached to a real news story (especially one that
 * can auto-publish with zero human review, see AutonomousPublishingService)
 * risks looking like fabricated/manipulated imagery of a real event or
 * person. A stock-photo search has no such risk and needs no attribution
 * under Pexels' license.
 */
@Injectable()
export class StockPhotoService {
  private readonly logger = new Logger(StockPhotoService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly systemSettings: SystemSettingsService,
    private readonly mediaService: MediaService,
  ) {}

  private async getApiKey(): Promise<string | null> {
    const dbKey = await this.systemSettings.getDecryptedValue(MEDIA_PROVIDER_SETTING_KEYS.pexelsApiKey);
    return dbKey || this.config.get<string>('PEXELS_API_KEY', '') || null;
  }

  async isConfigured(): Promise<boolean> {
    return (await this.getApiKey()) !== null;
  }

  async search(query: string, perPage = 6): Promise<StockPhotoResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new BadRequestException(
        'No Pexels API key configured - add one under System Settings to search stock photos.',
      );
    }

    const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&per_page=${Math.min(perPage, 15)}`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });

    if (!res.ok) {
      throw new BadRequestException(`Pexels search failed (${res.status})`);
    }

    const body = (await res.json()) as { photos: PexelsPhoto[] };
    return body.photos.map((p) => ({
      id: String(p.id),
      thumbnailUrl: p.src.medium,
      fullUrl: p.src.large2x || p.src.original,
      width: p.width,
      height: p.height,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      alt: p.alt,
    }));
  }

  /**
   * Downloads a previously-searched photo and stores it as a real MediaFile
   * via the existing upload pipeline (thumbnail generation, storage, etc.)
   * rather than hotlinking Pexels' CDN directly - keeps a permanent local
   * copy and lets alt-text/other MediaFile features apply normally.
   */
  async downloadAndAttach(
    result: Pick<StockPhotoResult, 'fullUrl' | 'photographer' | 'alt'>,
    uploaderId: string,
    organizationId: string,
  ) {
    assertAllowedPhotoUrl(result.fullUrl);
    const res = await fetch(result.fullUrl);
    if (!res.ok) {
      throw new BadRequestException(`Failed to download the selected photo (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const extension = contentType.split('/')[1]?.split(';')[0] || 'jpg';

    const pseudoFile = {
      buffer: Buffer.from(arrayBuffer),
      mimetype: contentType,
      originalname: `pexels-${Date.now()}.${extension}`,
      size: arrayBuffer.byteLength,
    } as Express.Multer.File;

    return this.mediaService.upload(pseudoFile, uploaderId, organizationId, {
      folder: 'stock-photos',
      altText: result.alt ?? undefined,
      caption: `Photo by ${result.photographer} on Pexels`,
    });
  }

  /**
   * Best-effort auto-pick for the autonomous publishing pipeline: searches
   * and attaches the first result with no human choice involved. Never
   * throws - a missing key, no results, or a network failure just means
   * the article publishes without a featured image (same "fail gracefully"
   * convention as every other AI/external-service call in this pipeline),
   * not a broken publish.
   */
  async autoAttachForQuery(query: string, uploaderId: string, organizationId: string) {
    try {
      if (!(await this.isConfigured())) return null;
      const results = await this.search(query, 1);
      if (results.length === 0) return null;
      return await this.downloadAndAttach(results[0], uploaderId, organizationId);
    } catch (err) {
      this.logger.warn(`Auto image attach failed for query "${query}": ${(err as Error).message}`);
      return null;
    }
  }
}
