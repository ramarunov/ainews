import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

export class UnsafeFetchTargetError extends Error {}

const DEFAULT_MAX_REDIRECTS = 5;

/**
 * Guards any server-side "fetch a URL the caller/an RSS feed gave us"
 * feature (ArticleExtractionService, RSS ingestion, stock-photo download)
 * against SSRF: resolves the hostname and rejects if ANY resolved address
 * is private/loopback/link-local/reserved (RFC1918, 127/8, 169.254/16 -
 * which covers the common cloud metadata endpoint 169.254.169.254 - CGNAT
 * 100.64/10, the TEST-NET blocks, multicast/reserved 224/4-255/4, plus the
 * IPv6 equivalents). Call before every such fetch (DNS can change between
 * calls), and see `safeFetch` for redirect-hop re-validation.
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

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new UnsafeFetchTargetError(`Could not resolve hostname: ${url.hostname}`);
  }

  if (addresses.length === 0) {
    throw new UnsafeFetchTargetError(`Hostname resolved to no addresses: ${url.hostname}`);
  }

  // Every A/AAAA record must be public. A hostname with one public and one
  // private record is a split-horizon / DNS-rebinding shape - reject it
  // rather than gamble on which address connect() picks.
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new UnsafeFetchTargetError(
        `Refusing to fetch a private/internal address (${url.hostname} -> ${address})`,
      );
    }
  }
}

/**
 * `fetch()` that re-validates every redirect hop. Plain `fetch` follows
 * redirects with no per-hop check, so a public URL that 302s to
 * 169.254.169.254 (or any internal host) would still be fetched. Follows
 * redirects manually, running `validate` (defaults to `assertPublicHttpUrl`)
 * on each hop, and returns the final Response plus the URL it landed on.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  options: {
    maxRedirects?: number;
    validate?: (url: string) => void | Promise<void>;
  } = {},
): Promise<{ response: Response; finalUrl: string }> {
  const validate = options.validate ?? assertPublicHttpUrl;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await validate(current);

    const response = await fetch(current, { ...init, redirect: 'manual' });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = isRedirect ? response.headers.get('location') : null;
    if (!location) {
      return { response, finalUrl: current };
    }

    // Resolve relative Location against the URL we just fetched.
    current = new URL(location, current).toString();
  }

  throw new UnsafeFetchTargetError(
    `Too many redirects (> ${maxRedirects}) starting from ${rawUrl}`,
  );
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments 192.0.0/24
    if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255 broadcast
    return false;
  }

  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local (fc00::/7)
    if (lower.startsWith('ff')) return true; // multicast (ff00::/8)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]); // IPv4-mapped IPv6
    return false;
  }

  return true; // unrecognized format - fail closed
}
