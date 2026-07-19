import { isGoogleNewsUrl } from './google-news-url.util';

describe('isGoogleNewsUrl', () => {
  it('recognizes a Google News RSS redirect link', () => {
    expect(isGoogleNewsUrl('https://news.google.com/rss/articles/CBMi-some-token?oc=5')).toBe(true);
  });

  it('does not flag a direct publisher URL', () => {
    expect(
      isGoogleNewsUrl('https://www.nytimes.com/2026/07/17/opinion/andy-burnham-britain-prime-minister.html'),
    ).toBe(false);
  });

  it('treats null/undefined as not a Google News URL', () => {
    expect(isGoogleNewsUrl(null)).toBe(false);
    expect(isGoogleNewsUrl(undefined)).toBe(false);
  });
});
