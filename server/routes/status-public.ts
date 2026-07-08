/**
 * GET /api/status/public
 *
 * Proxies Better Stack status page JSON and returns a normalized payload for the Harvous status UI.
 * Requires BETTERSTACK_STATUS_JSON_URL (must point at Better Stack's native URL after DNS cutover).
 */

import { Hono } from 'hono';
import {
  normalizeBetterStackJsonUrl,
  parseBetterStackStatus,
  type PublicStatusResponse,
} from '../utils/betterstack-status';

const route = new Hono();

const CACHE_MS = 30_000;
let cached: { data: PublicStatusResponse; fetchedAt: number } | null = null;

/** status.harvous.com redirects to marketing HTML; native JSON lives on betteruptime.com. */
const NATIVE_JSON_BY_HOST: Record<string, string> = {
  'status.harvous.com': 'https://harvous.betteruptime.com/index.json',
};

const UPSTREAM_HINT =
  'Set BETTERSTACK_STATUS_JSON_URL to https://harvous.betteruptime.com/index.json (not status.harvous.com).';

function resolveUpstreamUrl(): string | null {
  const configured = process.env.BETTERSTACK_STATUS_JSON_URL?.trim();
  if (configured) {
    const normalized = normalizeBetterStackJsonUrl(configured);
    try {
      const host = new URL(normalized).hostname;
      if (NATIVE_JSON_BY_HOST[host]) return NATIVE_JSON_BY_HOST[host];
    } catch {
      /* use normalized as-is */
    }
    return normalized;
  }
  // Pre-cutover fallback while status.harvous.com still points at Better Stack.
  if (process.env.NODE_ENV !== 'production') {
    return 'https://harvous.betteruptime.com/index.json';
  }
  return null;
}

function upstreamError(c: { json: (body: unknown, status: number) => Response }, message: string) {
  return c.json({ error: message }, 502);
}

/** Better Stack `updated_at` is page metadata, not last monitor check — use our fetch time. */
function withDataRefreshedAt(data: PublicStatusResponse, fetchedAt: number): PublicStatusResponse {
  return { ...data, updatedAt: new Date(fetchedAt).toISOString() };
}

route.get('/api/status/public', async (c) => {
  const upstream = resolveUpstreamUrl();
  if (!upstream) {
    return c.json({ error: 'Status page is not configured' }, 503);
  }

  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_MS) {
    return c.json(withDataRefreshedAt(cached.data, cached.fetchedAt), 200, {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
    });
  }

  try {
    const res = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    const looksLikeJson = contentType.includes('json') || text.trimStart().startsWith('{');

    if (!res.ok) {
      console.error('[api/status/public] upstream failed', res.status, upstream, res.url);
      if (cached) {
        return c.json(withDataRefreshedAt(cached.data, cached.fetchedAt), 200, {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
          'X-Status-Stale': '1',
        });
      }
      return upstreamError(
        c,
        `Better Stack returned HTTP ${res.status}. ${UPSTREAM_HINT}`,
      );
    }

    if (!looksLikeJson) {
      console.error('[api/status/public] upstream returned non-JSON', upstream, 'final', res.url);
      if (cached) {
        return c.json(withDataRefreshedAt(cached.data, cached.fetchedAt), 200, {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
          'X-Status-Stale': '1',
        });
      }
      return upstreamError(
        c,
        `Better Stack did not return JSON (got HTML from ${res.url}). The status page may be unpublished or the custom domain was removed. ${UPSTREAM_HINT}`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (parseErr) {
      console.error('[api/status/public] JSON parse failed', upstream, parseErr);
      return upstreamError(c, `Better Stack returned invalid JSON. ${UPSTREAM_HINT}`);
    }

    const data = parseBetterStackStatus(raw, upstream);
    cached = { data, fetchedAt: now };

    return c.json(withDataRefreshedAt(data, now), 200, {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
    });
  } catch (err) {
    console.error('[api/status/public] fetch error', upstream, err);
    if (cached) {
      return c.json(withDataRefreshedAt(cached.data, cached.fetchedAt), 200, {
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
        'X-Status-Stale': '1',
      });
    }
    const message =
      err instanceof TypeError && String(err.message).includes('Invalid URL')
        ? `Invalid BETTERSTACK_STATUS_JSON_URL. ${UPSTREAM_HINT}`
        : `Unable to reach Better Stack. ${UPSTREAM_HINT}`;
    return upstreamError(c, message);
  }
});

export default route;
