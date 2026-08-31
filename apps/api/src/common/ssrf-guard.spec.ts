jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

import { lookup } from 'node:dns/promises';
import { assertPublicHttpUrl, safeFetch, UnsafeFetchTargetError } from './ssrf-guard';

const mockedLookup = lookup as jest.Mock;
// lookup(host, { all: true }) resolves to an array of records.
const one = (address: string, family = 4) => [{ address, family }];

describe('assertPublicHttpUrl', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  it('rejects a malformed URL without ever resolving DNS', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(UnsafeFetchTargetError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('rejects a non-http(s) protocol without resolving DNS', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(UnsafeFetchTargetError);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('rejects when the hostname cannot be resolved', async () => {
    mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicHttpUrl('https://this-does-not-exist.example')).rejects.toThrow(
      UnsafeFetchTargetError,
    );
  });

  it('rejects when the hostname resolves to no addresses', async () => {
    mockedLookup.mockResolvedValue([]);
    await expect(assertPublicHttpUrl('https://example.com')).rejects.toThrow(UnsafeFetchTargetError);
  });

  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.0.0.5', 'RFC1918 10/8'],
    ['172.16.0.1', 'RFC1918 172.16/12'],
    ['172.31.255.255', 'RFC1918 172.16/12 upper bound'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['169.254.169.254', 'cloud metadata endpoint'],
    ['0.0.0.0', '"this network"'],
    ['100.64.0.1', 'CGNAT 100.64/10'],
    ['198.18.0.1', 'benchmarking 198.18/15'],
    ['203.0.113.5', 'TEST-NET-3'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('rejects a hostname resolving to %s (%s)', async (address) => {
    mockedLookup.mockResolvedValue(one(address));
    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).rejects.toThrow(
      UnsafeFetchTargetError,
    );
  });

  it.each([
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique local (fc00::/7)'],
    ['fd12:3456:789a::1', 'IPv6 unique local (fd variant)'],
    ['ff02::1', 'IPv6 multicast'],
    ['::ffff:169.254.169.254', 'IPv4-mapped IPv6 cloud metadata'],
  ])('rejects a hostname resolving to IPv6 %s (%s)', async (address) => {
    mockedLookup.mockResolvedValue(one(address, 6));
    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).rejects.toThrow(
      UnsafeFetchTargetError,
    );
  });

  it('rejects when ONE of several records is private (split horizon)', async () => {
    mockedLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(assertPublicHttpUrl('https://example.com')).rejects.toThrow(UnsafeFetchTargetError);
  });

  it('allows a hostname whose every record is a genuine public address', async () => {
    mockedLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).resolves.toBeUndefined();
  });
});

describe('safeFetch (redirect-hop re-validation)', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    mockedLookup.mockReset();
    mockedLookup.mockResolvedValue(one('93.184.216.34')); // public by default
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const mkRes = (status: number, location?: string) =>
    ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (h: string) => (h.toLowerCase() === 'location' ? location ?? null : null) },
    }) as unknown as Response;

  it('returns a non-redirect response as-is', async () => {
    global.fetch = jest.fn().mockResolvedValue(mkRes(200)) as any;
    const { response, finalUrl } = await safeFetch('https://a.example/');
    expect(response.status).toBe(200);
    expect(finalUrl).toBe('https://a.example/');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect chain that stays public', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(mkRes(301, 'https://b.example/x'))
      .mockResolvedValueOnce(mkRes(200)) as any;
    const { response, finalUrl } = await safeFetch('https://a.example/');
    expect(response.status).toBe(200);
    expect(finalUrl).toBe('https://b.example/x');
  });

  it('rejects when a redirect points at a private address', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(mkRes(302, 'http://169.254.169.254/latest')) as any;
    mockedLookup
      .mockResolvedValueOnce(one('93.184.216.34')) // first hop: public
      .mockResolvedValueOnce(one('169.254.169.254')); // redirect target: metadata
    await expect(safeFetch('https://a.example/')).rejects.toThrow(UnsafeFetchTargetError);
  });

  it('throws after too many redirects', async () => {
    global.fetch = jest.fn().mockResolvedValue(mkRes(302, 'https://loop.example/')) as any;
    await expect(safeFetch('https://a.example/', {}, { maxRedirects: 3 })).rejects.toThrow(
      /Too many redirects/,
    );
  });

  it('runs a caller-supplied validator on every hop', async () => {
    const validate = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(mkRes(301, 'https://b.example/'))
      .mockResolvedValueOnce(mkRes(200)) as any;
    await safeFetch('https://a.example/', {}, { validate });
    expect(validate).toHaveBeenCalledWith('https://a.example/');
    expect(validate).toHaveBeenCalledWith('https://b.example/');
  });
});
