import { containsLink, computeSpamScore, isLikelySpam } from './comment-spam-filter.util';

describe('containsLink', () => {
  it.each([
    'Check this out https://example.com',
    'visit www.example.com for more',
    'go to example.com/deal now',
    'promo-site.xyz has cheap stuff',
  ])('flags %s as containing a link', (content) => {
    expect(containsLink(content)).toBe(true);
  });

  it.each([
    'Great reporting on this story.',
    'I disagree with paragraph 3, e.g. the stats seem off.',
    'This happened on 12.5.2026, right?',
  ])('does not flag %s', (content) => {
    expect(containsLink(content)).toBe(false);
  });
});

describe('computeSpamScore / isLikelySpam', () => {
  it('scores ordinary commentary low and not spam', () => {
    const score = computeSpamScore('Thanks for the detailed explanation, very helpful!', 'Jane Reader');
    expect(score).toBeLessThan(5);
    expect(isLikelySpam('Thanks for the detailed explanation, very helpful!', 'Jane Reader')).toBe(false);
  });

  it('flags known spam keywords as likely spam', () => {
    expect(isLikelySpam('Cheap viagra and cialis, best casino deals!!', 'promo')).toBe(true);
  });

  it('scores SHOUTING ALL CAPS content higher than the equivalent normal-case text', () => {
    const shouted = computeSpamScore('THIS IS AN AMAZING OFFER YOU CANNOT MISS OUT ON TODAY', 'Bob');
    const normal = computeSpamScore('This is an amazing offer you cannot miss out on today', 'Bob');
    expect(shouted).toBeGreaterThan(normal);
  });

  it('flags near-empty content as suspicious', () => {
    expect(computeSpamScore('a', 'x1')).toBeGreaterThanOrEqual(3);
  });
});
