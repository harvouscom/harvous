/**
 * CSRF Protection Middleware
 *
 * Validates the Origin header on state-changing requests (POST, PUT, DELETE, PATCH)
 * to prevent cross-site request forgery.
 *
 * How it works:
 * - Reads allowed origins from ALLOWED_ORIGINS env var (comma-separated) or
 *   falls back to a default list (app.harvous.com + localhost dev).
 * - Skips CSRF checks for:
 *   - Safe methods (GET, HEAD, OPTIONS)
 *   - Webhook endpoints (called by external services, use their own auth)
 *   - Admin cron endpoints (called by CI/cron with Bearer token auth)
 *
 * Why Origin-based and not token-based:
 * - All state-changing endpoints already require Clerk session/Bearer auth
 * - Origin header is set by browsers and cannot be spoofed by JS
 * - Simpler than maintaining stateful CSRF tokens
 */

import type { Context, Next } from 'hono';

/** Routes that bypass CSRF (external service callbacks with their own auth) */
const CSRF_EXEMPT_PREFIXES = [
  '/api/webhooks/',
  '/api/admin/',
  '/api/migrations/',
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const DEFAULT_ORIGINS = [
  'https://app.harvous.com',
  // NOTE: no Capacitor/iOS/Android app ships today — web + PWA only, and the PWA
  // runs at app.harvous.com so it sends that origin. If a Capacitor build ever
  // ships, add 'https://localhost' (androidScheme in capacitor.config.ts) and
  // 'capacitor://localhost' (iOS default), or every mutation from it 403s. The
  // first-party Swift app needs nothing: URLSession sends no Origin header.
  'https://new.harvous.com',
  'https://status.harvous.com',
  'https://harvous.com',
  'http://localhost:3000',
  'http://localhost:3001',  // Hono API dev server
  'http://localhost:4321',  // Astro dev
  'http://localhost:4322',  // SPA Vite dev
];

/**
 * Enforcement gate. Default is OBSERVE: the checks run and log what they *would*
 * reject, but let the request through.
 *
 * This exists because this middleware was disabled from ~2025 to 2026 after false
 * 403s in production, and nobody could prove what was being rejected. Turning it
 * straight back on repeats that bet. Run in observe mode, read the logs, then set
 * CSRF_ENFORCE=true on Fly once the rejection set is empty or understood.
 */
function isEnforcing(): boolean {
  return process.env.CSRF_ENFORCE === 'true';
}

/**
 * Proxies can duplicate a header into "value, value". Netlify did this and it is
 * what broke CSRF originally — the Origin comparison saw the doubled string and
 * never matched. getSelfOrigin() already splits Host and X-Forwarded-Proto; this
 * applies the same rule to Origin and Referer, which it did not.
 */
function firstHeaderValue(v: string | undefined): string | undefined {
  if (!v) return v;
  return v.split(',')[0].trim();
}

/** Build the allowed origins set once at startup */
let allowedOrigins: Set<string> | null = null;

function getAllowedOrigins(): Set<string> {
  if (allowedOrigins) return allowedOrigins;

  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins && envOrigins.trim()) {
    const parsed = new Set(
      envOrigins.split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean)
    );
    // If env var was all whitespace/commas, fall through to defaults
    if (parsed.size > 0) {
      allowedOrigins = parsed;
      return allowedOrigins;
    }
  }

  // Defaults: production + common dev origins
  allowedOrigins = new Set(DEFAULT_ORIGINS);
  return allowedOrigins;
}

function isCsrfExempt(path: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix));
}

/**
 * Extract the self-origin from proxy headers.
 * Normalizes X-Forwarded-Proto (can be "https, https" through proxy chains)
 * and Host (can include default ports like ":443").
 */
function getSelfOrigin(c: Context): string | null {
  let host = c.req.header('Host') || c.req.header('X-Forwarded-Host');
  if (!host) return null;

  // Normalize: take first value if comma-separated, strip default ports
  host = host.split(',')[0].trim().replace(/:443$/, '').replace(/:80$/, '');

  // X-Forwarded-Proto can be "https, https" through multiple proxies — take first
  const rawProto = c.req.header('X-Forwarded-Proto') || 'https';
  const proto = rawProto.split(',')[0].trim();

  return `${proto}://${host}`;
}

/**
 * CSRF protection middleware for Hono.
 * Add after CORS middleware and before route handlers.
 */
export async function csrfProtection(c: Context, next: Next) {
  // Skip safe methods
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }

  // Skip exempt routes (webhooks, admin crons, etc.)
  if (isCsrfExempt(c.req.path)) {
    return next();
  }

  const origin = firstHeaderValue(c.req.header('Origin'));
  const referer = firstHeaderValue(c.req.header('Referer'));

  // If Origin header is present, validate it
  if (origin) {
    const allowed = getAllowedOrigins();
    const selfOrigin = getSelfOrigin(c);

    if (!allowed.has(origin) && origin !== selfOrigin) {
      console.warn(isEnforcing() ? '[csrf] Rejected origin:' : '[csrf][observe] WOULD reject origin:', {
        origin,
        selfOrigin,
        host: c.req.header('Host'),
        xfh: c.req.header('X-Forwarded-Host'),
        xfp: c.req.header('X-Forwarded-Proto'),
        allowedCount: allowed.size,
        path: c.req.path,
      });
      if (!isEnforcing()) return next();
      return c.json(
        { error: 'Forbidden: invalid origin', code: 'CSRF_REJECTED' },
        403
      );
    }
    return next();
  }

  // Fallback: check Referer header (some browsers omit Origin on same-origin)
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      const allowed = getAllowedOrigins();
      const selfOrigin = getSelfOrigin(c);

      if (!allowed.has(refererOrigin) && refererOrigin !== selfOrigin) {
        console.warn(isEnforcing() ? '[csrf] Rejected referer:' : '[csrf][observe] WOULD reject referer:', {
          refererOrigin,
          selfOrigin,
          host: c.req.header('Host'),
          xfh: c.req.header('X-Forwarded-Host'),
          xfp: c.req.header('X-Forwarded-Proto'),
          path: c.req.path,
        });
        if (!isEnforcing()) return next();
        return c.json(
          { error: 'Forbidden: invalid referer', code: 'CSRF_REJECTED' },
          403
        );
      }
      return next();
    } catch {
      // Malformed referer URL — reject
      console.warn('[csrf] Malformed referer:', { referer, path: c.req.path, enforcing: isEnforcing() });
      if (!isEnforcing()) return next();
      return c.json(
        { error: 'Forbidden: malformed referer', code: 'CSRF_REJECTED' },
        403
      );
    }
  }

  // Neither Origin nor Referer present.
  // This can happen for:
  //   - Same-origin requests in some browsers (fetch with no-cors mode)
  //   - Server-to-server calls (which use Bearer auth, not cookies)
  //   - Mobile app requests (Capacitor/native)
  //   - Some browser extensions or privacy settings that strip headers
  //
  // Allow these through — the Clerk auth middleware is the primary security layer.
  // CSRF protection is defense-in-depth; rejecting here would break legitimate
  // requests in too many edge cases.
  return next();
}
