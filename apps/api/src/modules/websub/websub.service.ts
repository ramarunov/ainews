import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { getPublicSiteOrgId } from '../../common/config/public-site-org.util';
import { getRootDomain } from '../../common/url/site-url.util';

interface ArticlePublishedEvent {
  articleId: string;
  organizationId: string;
  isFirstPublish?: boolean;
}

// WebSub / PubSubHubbub hub. Google's public hub is still the default;
// override with WEBSUB_HUB_URL (e.g. https://websubhub.com/hub) if it ever
// goes away. The feed itself advertises this same hub via
// <atom:link rel="hub"> (see apps/web/app/feed/route.ts).
const DEFAULT_HUB = 'https://pubsubhubbub.appspot.com/';

/**
 * Pings the WebSub hub the moment an article is first published, so
 * subscribed crawlers/aggregators re-fetch /feed immediately instead of
 * waiting for their next poll - meaningful lead time for Google Discover /
 * Google News, where speed of discovery matters. Same trigger/guards as
 * TelegramNotificationService (first publish only, public-site org only)
 * and, like every other article.published listener, never blocks or fails
 * the publish itself.
 */
@Injectable()
export class WebSubService {
  private readonly logger = new Logger(WebSubService.name);

  constructor(private readonly config: ConfigService) {}

  @OnEvent('article.published')
  async handleArticlePublished(event: ArticlePublishedEvent) {
    if (!event.isFirstPublish) return;

    let publicSiteOrgId: string;
    try {
      publicSiteOrgId = getPublicSiteOrgId(this.config);
    } catch {
      return;
    }
    if (event.organizationId !== publicSiteOrgId) return;

    const hub = this.config.get<string>('WEBSUB_HUB_URL', DEFAULT_HUB);
    // The apex feed is the cross-category aggregator (top 50 published
    // articles) - one ping re-fetches it and covers the new article. Not
    // pinging per-category feeds is a deliberate simplification; they have
    // few if any subscribers.
    const feedUrl = `https://${getRootDomain(this.config)}/feed`;

    try {
      await axios.post(
        hub,
        new URLSearchParams({ 'hub.mode': 'publish', 'hub.url': feedUrl }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 5000,
        },
      );
      this.logger.log(`WebSub: notified hub ${hub} of an update to ${feedUrl}`);
    } catch (err: any) {
      this.logger.warn(
        `WebSub hub ping failed for ${feedUrl}: ${err?.response?.status ?? err?.message ?? err}`,
      );
    }
  }
}
