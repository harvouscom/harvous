/**
 * Stable IDs for POST /api/test/seed-sample-votd and seed-sample-featured.
 * These rows live in the shared FeaturedItems table — never surface them to real users
 * when running on Netlify or NODE_ENV=production (see shouldExcludeDevSampleFeaturedItems).
 *
 * Local-only: set HARVOUS_ALLOW_DEV_FEATURED_SAMPLES=true to show these in /api/featured/items
 * (e.g. netlify dev with production-like env).
 */

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

/**
 * When true, /api/featured/items omits dev seed rows so they never appear on user dashboards
 * (even if they were accidentally inserted into a production DB).
 */
export function shouldExcludeDevSampleFeaturedItems(): boolean {
  if (process.env.HARVOUS_ALLOW_DEV_FEATURED_SAMPLES === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  // Netlify Functions (all deploy contexts): exclude so preview/branch deploys sharing prod DB
  // never show dev seed cards.
  if (process.env.NETLIFY === 'true') {
    return true;
  }
  return false;
}

/** Block destructive / seed test routes (stricter than NODE_ENV alone — Netlify may omit it). */
export function isTestRoutesForbidden(): boolean {
  if (process.env.HARVOUS_ALLOW_TEST_API_ROUTES === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  if (process.env.NETLIFY === 'true') {
    return true;
  }
  return false;
}
