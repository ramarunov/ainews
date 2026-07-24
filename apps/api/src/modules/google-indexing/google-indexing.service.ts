import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import axios from 'axios';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { GOOGLE_INDEXING_SETTING_KEYS } from '../system-settings/system-settings.constants';
import { getPublicSiteOrgId } from '../../common/config/public-site-org.util';
import { getArticleUrl, getRootDomain } from '../../common/url/site-url.util';

interface ArticlePublishedEvent {
  articleId: string;
  organizationId: string;
  slug: string;
  isFirstPublish?: boolean;
}

interface ArticleDeletedEvent {
  articleId: string;
  organizationId: string;
  userId: string;
}

type NotificationType = 'URL_UPDATED' | 'URL_DELETED';

const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';
const INDEXING_ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications:publish';

/**
 * Auto-submits an article's canonical URL to Google's Indexing API the
 * moment it's published (or removed), so Google doesn't have to wait for
 * its own crawl schedule to notice. Officially Google only documents this
 * API for JobPosting/BroadcastEvent pages, not general news content - using
 * it here is the same widely-used-but-unofficial practice most publishers
 * actually rely on for faster discovery, not a documented guarantee. Off by
 * default (inert until a service account is configured via System
 * Settings) and never blocks or fails the publish/delete itself - same
 * fail-gracefully convention as Telegram/webhooks/SEO, the other listeners
 * on these same events.
 *
 * Unlike TelegramNotificationService, this fires on EVERY article.published
 * event, not just isFirstPublish - URL_UPDATED's whole purpose is "this
 * URL's content changed, please recrawl," which is just as true for a
 * later edit as for the first publish. Google's default quota is 200 URL
 * notifications/day per project; a 429 here just gets logged and dropped,
 * same as any other failure.
 */
@Injectable()
export class GoogleIndexingService {
  private readonly logger = new Logger(GoogleIndexingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  @OnEvent('article.published')
  async handleArticlePublished(event: ArticlePublishedEvent) {
    if (!(await this.isEligible(event.organizationId))) return;
    await this.notify(event.articleId, 'URL_UPDATED');
  }

  @OnEvent('article.deleted')
  async handleArticleDeleted(event: ArticleDeletedEvent) {
    if (!(await this.isEligible(event.organizationId))) return;
    await this.notify(event.articleId, 'URL_DELETED');
  }

  // Only the real public site's own articles are worth telling Google about
  // - the many leftover test/demo orgs from manual testing must never spend
  // quota (or worse, submit garbage URLs) to a real Search Console property.
  private async isEligible(organizationId: string): Promise<boolean> {
    let publicSiteOrgId: string;
    try {
      publicSiteOrgId = getPublicSiteOrgId(this.config);
    } catch {
      return false;
    }
    return organizationId === publicSiteOrgId;
  }

  private async notify(articleId: string, type: NotificationType) {
    try {
      const serviceAccountJson = await this.systemSettings.getDecryptedValue(
        GOOGLE_INDEXING_SETTING_KEYS.serviceAccountJson,
      );
      if (!serviceAccountJson) return;

      const article = await this.prisma.article.findUnique({
        where: { id: articleId },
        select: {
          slug: true,
          primaryCategory: {
            select: { slug: true, subdomain: true, parent: { select: { subdomain: true } } },
          },
        },
      });
      if (!article) return;

      const url = getArticleUrl(article, getRootDomain(this.config));
      const credentials = JSON.parse(serviceAccountJson);
      const client = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [INDEXING_SCOPE],
      });
      const { token } = await client.getAccessToken();

      await axios.post(
        INDEXING_ENDPOINT,
        { url, type },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 },
      );

      this.logger.log(`Requested Google indexing (${type}) for ${url}`);
    } catch (err: any) {
      this.logger.warn(
        `Google indexing request (${type}) failed for article ${articleId}: ${err?.response?.data?.error?.message ?? err?.message ?? err}`,
      );
    }
  }
}
