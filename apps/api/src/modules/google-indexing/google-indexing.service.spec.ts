import axios from 'axios';
import { JWT } from 'google-auth-library';
import { GoogleIndexingService } from './google-indexing.service';
import { GOOGLE_INDEXING_SETTING_KEYS } from '../system-settings/system-settings.constants';

jest.mock('axios');
jest.mock('google-auth-library');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedJWT = JWT as jest.MockedClass<typeof JWT>;

describe('GoogleIndexingService', () => {
  let service: GoogleIndexingService;
  let prisma: any;
  let config: any;
  let systemSettings: any;

  const serviceAccountJson = JSON.stringify({
    client_email: 'indexer@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
  });

  const article = {
    slug: 'big-story-breaks',
    primaryCategory: { slug: 'kesehatan', subdomain: 'kesehatan', parent: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      article: { findUnique: jest.fn().mockResolvedValue(article) },
    };
    config = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'PUBLIC_SITE_ORG_ID') return 'org-public';
        if (key === 'ROOT_DOMAIN') return 'beritabot.example';
        return def;
      }),
    };
    systemSettings = {
      getDecryptedValue: jest.fn().mockResolvedValue(serviceAccountJson),
    };
    MockedJWT.mockImplementation(
      () =>
        ({
          getAccessToken: jest.fn().mockResolvedValue({ token: 'fake-access-token' }),
        }) as any,
    );
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

    service = new GoogleIndexingService(prisma, config, systemSettings);
  });

  const publishedEvent = (overrides: Partial<any> = {}) => ({
    articleId: 'article-1',
    organizationId: 'org-public',
    slug: 'big-story-breaks',
    isFirstPublish: true,
    ...overrides,
  });

  const permanentlyDeletedEvent = (overrides: Partial<any> = {}) => ({
    articleId: 'article-1',
    organizationId: 'org-public',
    userId: 'user-1',
    ...overrides,
  });

  it('submits URL_UPDATED for the article\'s canonical (category-subdomain) URL on publish', async () => {
    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://indexing.googleapis.com/v3/urlNotifications:publish',
      { url: 'https://kesehatan.beritabot.example/news/big-story-breaks', type: 'URL_UPDATED' },
      { headers: { Authorization: 'Bearer fake-access-token' }, timeout: 10000 },
    );
  });

  it('fires on every publish event, not just the first publish (unlike Telegram)', async () => {
    await service.handleArticlePublished(publishedEvent({ isFirstPublish: false }));

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('submits URL_DELETED when an article is permanently deleted', async () => {
    await service.handleArticlePermanentlyDeleted(permanentlyDeletedEvent());

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://indexing.googleapis.com/v3/urlNotifications:publish',
      { url: 'https://kesehatan.beritabot.example/news/big-story-breaks', type: 'URL_DELETED' },
      expect.any(Object),
    );
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

  it('does nothing when no service account is configured', async () => {
    systemSettings.getDecryptedValue.mockResolvedValue(null);

    await service.handleArticlePublished(publishedEvent());

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('reads the service account via SystemSettingsService, keyed correctly', async () => {
    await service.handleArticlePublished(publishedEvent());

    expect(systemSettings.getDecryptedValue).toHaveBeenCalledWith(
      GOOGLE_INDEXING_SETTING_KEYS.serviceAccountJson,
    );
  });

  it('never throws when the Indexing API call fails - publishing must not be affected', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: { message: 'Quota exceeded' } } } });

    await expect(service.handleArticlePublished(publishedEvent())).resolves.toBeUndefined();
  });

  it('never throws when the stored service account JSON is malformed', async () => {
    systemSettings.getDecryptedValue.mockResolvedValue('not valid json');

    await expect(service.handleArticlePublished(publishedEvent())).resolves.toBeUndefined();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
