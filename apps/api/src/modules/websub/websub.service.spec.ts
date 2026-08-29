import axios from 'axios';
import { WebSubService } from './websub.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebSubService', () => {
  let service: WebSubService;
  let config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'PUBLIC_SITE_ORG_ID') return 'org-public';
        if (key === 'ROOT_DOMAIN') return 'rusdimedia.example';
        return def;
      }),
    };
    service = new WebSubService(config);
    mockedAxios.post.mockResolvedValue({ status: 204, data: '' } as any);
  });

  it('pings the default hub with hub.mode=publish and the apex feed URL on first publish', async () => {
    await service.handleArticlePublished({
      articleId: 'a1',
      organizationId: 'org-public',
      isFirstPublish: true,
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://pubsubhubbub.appspot.com/');
    expect(body).toContain('hub.mode=publish');
    expect(body).toContain(encodeURIComponent('https://rusdimedia.example/feed'));
  });

  it('honours a WEBSUB_HUB_URL override', async () => {
    config.get.mockImplementation((key: string, def?: any) =>
      key === 'PUBLIC_SITE_ORG_ID'
        ? 'org-public'
        : key === 'ROOT_DOMAIN'
          ? 'rusdimedia.example'
          : key === 'WEBSUB_HUB_URL'
            ? 'https://websubhub.com/hub'
            : def,
    );

    await service.handleArticlePublished({
      articleId: 'a1',
      organizationId: 'org-public',
      isFirstPublish: true,
    });

    expect(mockedAxios.post.mock.calls[0][0]).toBe('https://websubhub.com/hub');
  });

  it('does nothing on a re-publish (not the first publish)', async () => {
    await service.handleArticlePublished({
      articleId: 'a1',
      organizationId: 'org-public',
      isFirstPublish: false,
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('does nothing for a non-public-site organization', async () => {
    await service.handleArticlePublished({
      articleId: 'a1',
      organizationId: 'some-other-org',
      isFirstPublish: true,
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('swallows a hub failure - never throws into the publish flow', async () => {
    mockedAxios.post.mockRejectedValue(new Error('hub down'));
    await expect(
      service.handleArticlePublished({
        articleId: 'a1',
        organizationId: 'org-public',
        isFirstPublish: true,
      }),
    ).resolves.toBeUndefined();
  });
});
