import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  key: string;
  bucket: string;
  url: string;
  etag?: string;
}

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly cdnUrl: string;
  private readonly serverSideEncryption: boolean;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      endpoint: config.get('S3_ENDPOINT'),
      region: config.get('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', ''),
        secretAccessKey: config.get('S3_SECRET_KEY', ''),
      },
      forcePathStyle: true, // Required for MinIO
    });

    this.bucket = config.get('S3_BUCKET', 'ainews-media');
    this.publicUrl = config.get('S3_PUBLIC_URL', '');
    this.cdnUrl = config.get('CDN_URL', '');
    // MinIO (local/dev) rejects SSE without a configured KMS; real AWS S3
    // supports AES256 SSE with no extra setup. Off by default so local dev
    // works out of the box; set S3_SERVER_SIDE_ENCRYPTION=true in production.
    this.serverSideEncryption = config.get('S3_SERVER_SIDE_ENCRYPTION', 'false') === 'true';
  }

  /**
   * Upload a file buffer to S3-compatible storage
   */
  async upload(
    buffer: Buffer,
    options: {
      folder?: string;
      filename?: string;
      contentType: string;
      organizationId: string;
    },
  ): Promise<UploadResult> {
    const folder = options.folder ?? 'uploads';
    const ext = options.filename ? extname(options.filename) : '';
    const key = `${options.organizationId}/${folder}/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: options.contentType,
      ...(this.serverSideEncryption && { ServerSideEncryption: 'AES256' }),
      // Prevent caching of sensitive data
      CacheControl: 'public, max-age=31536000, immutable',
    });

    const response = await this.s3.send(command);

    return {
      key,
      bucket: this.bucket,
      url: this.getPublicUrl(key),
      etag: response.ETag,
    };
  }

  /**
   * Delete a file from storage
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3.send(command);
  }

  /**
   * Generate a pre-signed URL for private file access (expires in 1 hour)
   */
  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /**
   * Get the public URL for a stored file
   */
  getPublicUrl(key: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${key}`;
    }
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a secure storage key for an organization's file
   */
  generateKey(organizationId: string, folder: string, filename: string): string {
    const ext = extname(filename);
    const hash = createHash('sha256')
      .update(`${organizationId}-${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
    return `${organizationId}/${folder}/${hash}${ext}`;
  }
}
