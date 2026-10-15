/**
 * Fetching a URL a user gave us, without letting it point the server at itself.
 *
 * A saved link is user input, and the server fetching it is a request made from inside
 * our network: `http://169.254.169.254/` is the cloud metadata service, `fdaa::…` is Fly's
 * private network, `localhost:5432` is a database. Every hop is checked — the URL, every
 * address its host resolves to, and every redirect — before a byte is requested.
 *
 * What this does not close: DNS rebinding between our lookup and fetch's own. Pinning the
 * address would need a custom agent per request; the window is a TTL-0 race against an
 * endpoint that only returns extracted article text, which is an acceptable residue.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeUrlError extends Error {
  readonly code = 'UNSAFE_URL';
}

export type LookupFn = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function isNonPublicIpv4(address: string): boolean {
  const o = ipv4Octets(address);
  if (!o) return true;
  const [a, b] = o;
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && o[2] === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

/** True for any address a server-side fetch must not reach. Unparseable counts as unsafe. */
export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isNonPublicIpv4(address);
  if (family !== 6) return true;
  const a = address.toLowerCase();
  if (a === '::' || a === '::1') return true;
  /* IPv4 wearing an IPv6 coat — judge the IPv4 inside. */
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isNonPublicIpv4(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) return true; // hex-form mapped; refuse rather than decode
  const first = Number.parseInt(a.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7 (Fly's 6PN is fdaa::/16)
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast
    a.startsWith('64:ff9b:') // NAT64 — could translate to anything
  );
}

/** Throws `UnsafeUrlError` unless `raw` is plain http(s) on a default port to public addresses. */
export async function assertPublicHttpUrl(raw: string | URL, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Not a URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https links can be read');
  }
  if (url.username || url.password) throw new UnsafeUrlError('Links with credentials are refused');
  /* Public sites live on the default ports; anything else is far likelier to be a service. */
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new UnsafeUrlError('Non-standard ports are refused');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host).catch(() => []);
  if (addresses.length === 0) throw new UnsafeUrlError('Host did not resolve');
  if (addresses.some(({ address }) => isNonPublicAddress(address))) {
    throw new UnsafeUrlError('Host resolves to a private address');
  }
  return url;
}

export type PublicFetchResult = {
  url: URL;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
};

/**
 * GET a public page as text: redirects followed by hand (each one re-checked), a hard
 * timeout, and a byte cap so a 2GB "article" costs us 3MB.
 */
export async function fetchPublicText(
  raw: string,
  {
    maxBytes = 3 * 1024 * 1024,
    timeoutMs = 10_000,
    maxRedirects = 5,
    headers = {},
    fetchImpl = fetch,
    lookup = defaultLookup,
  }: {
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
    lookup?: LookupFn;
  } = {},
): Promise<PublicFetchResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = await assertPublicHttpUrl(raw, lookup);
  for (let hop = 0; ; hop += 1) {
    const response = await fetchImpl(url, { headers, redirect: 'manual', signal });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      if (hop >= maxRedirects) throw new UnsafeUrlError('Too many redirects');
      url = await assertPublicHttpUrl(new URL(location, url), lookup);
      continue;
    }
    const { text, truncated } = await readCapped(response, maxBytes);
    return {
      url,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body: text,
      truncated,
    };
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const charset = /charset=([^;]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]?.trim();
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset || 'utf-8');
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  if (!response.body) return { text: '', truncated: false };
  const reader = response.body.getReader();
  const chunks: string[] = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      truncated = true;
      chunks.push(decoder.decode(value.subarray(0, value.byteLength - (received - maxBytes)), { stream: true }));
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return { text: chunks.join(''), truncated };
}
