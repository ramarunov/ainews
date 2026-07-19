jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

import { lookup } from 'node:dns/promises';
import { assertPublicHttpUrl, UnsafeFetchTargetError } from './ssrf-guard';

const mockedLookup = lookup as jest.Mock;

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

  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.0.0.5', 'RFC1918 10/8'],
    ['172.16.0.1', 'RFC1918 172.16/12'],
    ['172.31.255.255', 'RFC1918 172.16/12 upper bound'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['169.254.169.254', 'cloud metadata endpoint'],
    ['0.0.0.0', '"this network"'],
  ])('rejects a hostname resolving to %s (%s)', async (address) => {
    mockedLookup.mockResolvedValue({ address, family: 4 });

    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).rejects.toThrow(
      UnsafeFetchTargetError,
    );
  });

  it.each([
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique local (fc00::/7)'],
    ['fd12:3456:789a::1', 'IPv6 unique local (fd variant)'],
    ['::ffff:169.254.169.254', 'IPv4-mapped IPv6 cloud metadata'],
  ])('rejects a hostname resolving to IPv6 %s (%s)', async (address) => {
    mockedLookup.mockResolvedValue({ address, family: 6 });

    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).rejects.toThrow(
      UnsafeFetchTargetError,
    );
  });

  it('allows a hostname resolving to a genuine public IPv4 address', async () => {
    mockedLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).resolves.toBeUndefined();
  });

  it('allows a hostname resolving to a genuine public IPv6 address', async () => {
    mockedLookup.mockResolvedValue({ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 });

    await expect(assertPublicHttpUrl('https://example.com/feed.xml')).resolves.toBeUndefined();
  });
});
