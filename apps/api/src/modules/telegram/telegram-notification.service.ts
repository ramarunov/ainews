import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { TELEGRAM_SETTING_KEYS } from '../system-settings/system-settings.constants';
import { getPublicSiteOrgId } from '../../common/config/public-site-org.util';

interface ArticlePublishedEvent {
  articleId: string;
  organizationId: string;
  slug: string;
  isFirstPublish?: boolean;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Posts a Telegram channel message when an article is published - manual
 * publish and the scheduled-publish sweep both funnel through
 * ArticlesService.update(), which is the single place 'article.published' is
 * emitted, so one listener here covers both trigger paths with no changes
 * needed to either. Off by default (inert until both the bot token and chat
 * id are configured via System Settings) and never blocks or fails the
 * publish itself - same fail-gracefully convention as webhooks/SEO/GEO,
 * the other listeners on this same event.
 */
@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  @OnEvent('article.published')
  async handleArticlePublished(event: ArticlePublishedEvent) {
    // This event re-fires on every save that leaves an article PUBLISHED,
    // not just the first publish (see seo.service.ts's onArticlePublished
    // comment) - a channel notification must only fire once, on the actual
    // publish moment, not on every later typo fix.
    if (!event.isFirstPublish) return;

    // Only the real public site's own publishes are newsworthy here - the
    // many leftover test/demo orgs from manual testing must never post to
    // the channel.
    let publicSiteOrgId: string;
    try {
      publicSiteOrgId = getPublicSiteOrgId(this.config);
    } catch {
      return;
    }
    if (event.organizationId !== publicSiteOrgId) return;

    try {
      await this.notify(event.articleId);
    } catch (err: any) {
      this.logger.warn(
        `Telegram notification failed for article ${event.articleId}: ${err?.response?.data?.description ?? err?.message ?? err}`,
      );
    }
  }

  private async notify(articleId: string) {
    const [botToken, chatIdRow] = await Promise.all([
      this.systemSettings.getDecryptedValue(TELEGRAM_SETTING_KEYS.botToken),
      this.prisma.systemSetting.findUnique({ where: { key: TELEGRAM_SETTING_KEYS.chatId } }),
    ]);
    if (!botToken || !chatIdRow) return;

    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { title: true, excerpt: true, slug: true, featuredImageUrl: true },
    });
    if (!article) return;

    const siteUrl = this.config.get<string>('APP_URL', 'http://localhost:3100').replace(/\/$/, '');
    const link = `${siteUrl}/news/${article.slug}`;
    const caption = [
      `<b>${escapeHtml(article.title)}</b>`,
      article.excerpt ? escapeHtml(article.excerpt) : null,
      link,
    ]
      .filter(Boolean)
      .join('\n\n');

    const base = `https://api.telegram.org/bot${botToken}`;
    const chatId = chatIdRow.value;

    // 10s, not the 5s used elsewhere in this codebase for outbound calls
    // (e.g. WebhooksService) - sendPhoto in particular has Telegram fetch
    // the image URL server-side itself, which is slower than a plain
    // sendMessage and more prone to tripping a tight timeout.
    const requestTimeout = 10000;

    if (article.featuredImageUrl) {
      try {
        await axios.post(
          `${base}/sendPhoto`,
          { chat_id: chatId, photo: article.featuredImageUrl, caption, parse_mode: 'HTML' },
          { timeout: requestTimeout },
        );
        return;
      } catch (err: any) {
        // Falls through to a plain text message below - a photo URL
        // Telegram's servers can't fetch (not publicly reachable, wrong
        // format, temporarily down, etc.) must not mean the whole
        // notification is lost, just that it arrives without the image.
        this.logger.warn(
          `Telegram sendPhoto failed for article ${articleId}, falling back to a text-only message: ${err?.response?.data?.description ?? err?.message ?? err}`,
        );
      }
    }

    await axios.post(
      `${base}/sendMessage`,
      { chat_id: chatId, text: caption, parse_mode: 'HTML' },
      { timeout: requestTimeout },
    );
  }
}
