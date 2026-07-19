import axios from 'axios';
import { TelegramNotificationService } from './telegram-notification.service';
import { TELEGRAM_SETTING_KEYS } from '../system-settings/system-settings.constants';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TelegramNotificationService', () => {
  let service: TelegramNotificationService;
  let prisma: any;
  let config: any;
  let systemSettings: any;

  const article = {
    title: 'Big Story Breaks',
    excerpt: 'Something important happened.',
    slug: 'big-story-breaks',
    featuredImageUrl: 'https://cdn.example.com/photo.jpg',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      systemSetting: { findUnique: jest.fn() },
      article: { findUnique: jest.fn().mockResolvedValue(article) },
    };
    config = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'PUBLIC_SITE_ORG_ID') return 'org-public';
        if (key === 'APP_URL') return 'https://beritabot.example';
        return def;
      }),
    };
    systemSettings = {
      getDecryptedValue: jest.fn().mockResolvedValue('123:bot-token'),
    };
    prisma.systemSetting.findUnique.mockResolvedValue({ value: '@my-channel' });
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

    service = new TelegramNotificationService(prisma, config, systemSettings);
  });

  const publishedEvent = (overrides: Partial<any> = {}) => ({
    articleId: 'article-1',
    organizationId: 'org-public',
    slug: 'big-story-breaks',
    isFirstPublish: true,
    ...overrides,
  });

  it('sends a photo message (with caption + link) when the article has a featured image', async () => {
    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123:bot-token/sendPhoto',
      expect.objectContaining({
        chat_id: '@my-channel',
        photo: article.featuredImageUrl,
        caption: expect.stringContaining('Big Story Breaks'),
      }),
      expect.any(Object),
    );
    const caption = mockedAxios.post.mock.calls[0][1] as any;
    expect(caption.caption).toContain('https://beritabot.example/news/big-story-breaks');
  });

  it('falls back to a plain text message when sendPhoto fails (e.g. a photo URL Telegram cannot reach)', async () => {
    mockedAxios.post.mockImplementation((url: string) => {
      if (url.includes('/sendPhoto')) {
        return Promise.reject({ response: { data: { description: 'Bad Request: wrong HTTP URL specified' } } });
      }
      return Promise.resolve({ status: 200, data: {} });
    });

    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123:bot-token/sendPhoto',
      expect.any(Object),
      expect.any(Object),
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123:bot-token/sendMessage',
      expect.objectContaining({ chat_id: '@my-channel', text: expect.stringContaining('Big Story Breaks') }),
      expect.any(Object),
    );
  });

  it('falls back to a plain text message when the article has no featured image', async () => {
    prisma.article.findUnique.mockResolvedValue({ ...article, featuredImageUrl: null });

    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123:bot-token/sendMessage',
      expect.objectContaining({ chat_id: '@my-channel', text: expect.stringContaining('Big Story Breaks') }),
      expect.any(Object),
    );
  });

  it('does nothing when the event is a later re-save, not the first publish', async () => {
    await service.handleArticlePublished(publishedEvent({ isFirstPublish: false }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does nothing for an organization other than the configured public site', async () => {
    await service.handleArticlePublished(publishedEvent({ organizationId: 'some-other-org' }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does nothing when the public site itself is not configured', async () => {
    config.get.mockImplementation((key: string, def?: any) =>
      key === 'PUBLIC_SITE_ORG_ID' ? '' : def,
    );

    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does nothing when the bot token is not configured', async () => {
    systemSettings.getDecryptedValue.mockResolvedValue(null);

    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does nothing when the chat id is not configured', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue(null);

    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('never throws when the Telegram API call fails - publishing must not be affected', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Telegram is down'));

    await expect(service.handleArticlePublished(publishedEvent())).resolves.toBeUndefined();
  });

  it('reads the bot token via SystemSettingsService, keyed correctly', async () => {
    await service.handleArticlePublished(publishedEvent());

    expect(systemSettings.getDecryptedValue).toHaveBeenCalledWith(TELEGRAM_SETTING_KEYS.botToken);
  });
});
