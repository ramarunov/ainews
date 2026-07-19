import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

export class UnsafeFetchTargetError extends Error {}

/**
 * Guards any server-side "fetch a URL the caller/an RSS feed gave us"
 * feature (ArticleExtractionService, RSS ingestion) against SSRF: resolves
 * the hostname and rejects if it lands on a private/loopback/link-local
 * address (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16 - which
 * also covers the common cloud metadata endpoint 169.254.169.254 - plus
 * the IPv6 equivalents). Without this, anything that can add an RSS
 * source or otherwise steer this fetch (a news source URL, an
 * AI-resolved redirect) could make the server read its own internal
 * network. Call before every such fetch, not just once at startup - DNS
 * can change between calls.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeFetchTargetError(`Not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeFetchTargetError(`Unsupported protocol: ${url.protocol}`);
  }

  let address: string;
  try {
    ({ address } = await lookup(url.hostname));
  } catch {
    throw new UnsafeFetchTargetError(`Could not resolve hostname: ${url.hostname}`);
  }

  if (isPrivateOrReservedIp(address)) {
    throw new UnsafeFetchTargetError(
      `Refusing to fetch a private/internal address (${url.hostname} -> ${address})`,
    );
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    return false;
  }

  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local (fc00::/7)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]); // IPv4-mapped IPv6
    return false;
  }

  return true; // unrecognized format - fail closed
}
