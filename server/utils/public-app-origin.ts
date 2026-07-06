import type { Context } from 'hono';

const DEFAULT_DEV_SPA_ORIGIN = 'http://localhost:4322';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

function isLocalDevApiOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '3001';
  } catch {
    return false;
  }
}

function isTrustedAppOrigin(origin: string): boolean {
  if (isLocalDevApiOrigin(origin)) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host === 'harvous.com' || host.endsWith('.harvous.com')) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * User-facing app origin for share/join links.
 * In local dev the API runs on :3001 but links must point at the SPA (:4322).
 */
export function getPublicAppOrigin(c: Context): string {
  const envOrigin = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (envOrigin) return normalizeOrigin(envOrigin);

  const originHeader = c.req.header('Origin')?.trim();
  if (originHeader && isTrustedAppOrigin(originHeader)) {
    return normalizeOrigin(originHeader);
  }

  const referer = c.req.header('Referer')?.trim();
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (isTrustedAppOrigin(refOrigin)) return normalizeOrigin(refOrigin);
    } catch {
      /* ignore malformed referer */
    }
  }

  const forwardedHost = c.req.header('X-Forwarded-Host')?.split(',')[0]?.trim();
  const forwardedProto = c.req.header('X-Forwarded-Proto')?.split(',')[0]?.trim() || 'https';
  if (forwardedHost) {
    const host = forwardedHost.replace(/:443$/, '').replace(/:80$/, '');
    return normalizeOrigin(`${forwardedProto}://${host}`);
  }

  const requestOrigin = normalizeOrigin(new URL(c.req.url).origin);
  if (requestOrigin === 'http://localhost:3001' || requestOrigin === 'http://127.0.0.1:3001') {
    return DEFAULT_DEV_SPA_ORIGIN;
  }

  return requestOrigin;
}
