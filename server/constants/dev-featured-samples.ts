/**
 * Stable IDs for POST /api/test/seed-sample-votd and seed-sample-featured.
 * Featured sample rows are **localhost-only**: seeds and API visibility require a localhost Host
 * (and never run on Netlify / NODE_ENV=production).
 */

import type { Context } from 'hono';

export const SAMPLE_VOTD_SCHEDULE_ID = 'votd_dev_sample';
export const SAMPLE_VOTD_FEATURED_ID = 'votd_fi_dev_sample';

export const SAMPLE_FEATURED_SPACE_ID = 'fi_dev_sample_space';
export const SAMPLE_FEATURED_THREAD_ID = 'fi_dev_sample_thread';
export const SAMPLE_FEATURED_RECALL_ID = 'fi_dev_sample_recall';
export const SAMPLE_FEATURED_CHALLENGE_ID = 'fi_dev_sample_challenge';
export const SAMPLE_FEATURED_CHURCH_ID = 'fi_dev_sample_church';

export const ALL_SAMPLE_FEATURED_IDS = [
  SAMPLE_VOTD_FEATURED_ID,
  SAMPLE_FEATURED_SPACE_ID,
  SAMPLE_FEATURED_THREAD_ID,
  SAMPLE_FEATURED_RECALL_ID,
  SAMPLE_FEATURED_CHALLENGE_ID,
  SAMPLE_FEATURED_CHURCH_ID,
] as const;

/** Same IDs; used by featured feed filter */
export const DEV_SAMPLE_FEATURED_ITEM_IDS: string[] = [...ALL_SAMPLE_FEATURED_IDS];

/** Any deployed host (Netlify, Fly) or explicit production build — never treat as local dev. */
export function isDeployedProductionLike(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.NETLIFY === 'true' ||
    !!process.env.FLY_APP_NAME
  );
}

export function getInboundHost(c: Context): string {
  const fwd = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  if (fwd) return fwd;
  return c.req.header('host')?.trim() ?? '';
}

/** True for localhost / 127.0.0.1 / ::1 (with optional port). */
export function isLocalhostHost(hostWithPort: string): boolean {
  if (!hostWithPort.trim()) return false;
  let h = hostWithPort.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    h = end === -1 ? h : h.slice(1, end);
  } else {
    const lastColon = h.lastIndexOf(':');
    if (lastColon > 0 && /^\d+$/.test(h.slice(lastColon + 1))) {
      h = h.slice(0, lastColon);
    }
  }
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0:0:0:0:0:0:0:1';
}

/**
 * Omit dev sample featured rows from JSON unless request is local dev over localhost.
 * Deployed APIs always exclude (even if DB still has seed rows).
 */
export function shouldExcludeDevSampleFeaturedItems(c: Context): boolean {
  if (isDeployedProductionLike()) {
    return true;
  }
  return !isLocalhostHost(getInboundHost(c));
}

const SAMPLE_FORBIDDEN = 'Featured sample endpoints are only available on localhost (local dev).';

/** For POST seed-sample-votd / seed-sample-featured — null if OK, else 403 response. */
export function featuredSampleSeedForbiddenResponse(c: Context): Response | null {
  if (isDeployedProductionLike()) {
    return c.json({ error: SAMPLE_FORBIDDEN }, 403);
  }
  if (!isLocalhostHost(getInboundHost(c))) {
    return c.json({ error: SAMPLE_FORBIDDEN }, 403);
  }
  return null;
}

/** Block destructive / non-featured test routes (stricter than NODE_ENV alone — a host may omit it). */
export function isTestRoutesForbidden(): boolean {
  if (process.env.HARVOUS_ALLOW_TEST_API_ROUTES === 'true') {
    return false;
  }
  return isDeployedProductionLike();
}
