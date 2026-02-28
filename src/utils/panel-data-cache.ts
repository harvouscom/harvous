/**
 * Short-lived in-memory cache for panel data (subscription, sharing, referral).
 * Avoids showing loading when reopening the same panel within TTL.
 */

const TTL_MS = 2 * 60 * 1000; // 2 minutes

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCachedPanelData<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedPanelData<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

export function invalidatePanelDataCache(key: string): void {
  cache.delete(key);
}

export const PANEL_CACHE_KEYS = {
  subscription: 'panel:subscription',
  sharing: 'panel:sharing',
  referral: 'panel:referral',
  achievements: 'panel:achievements',
  mySpaces: 'panel:mySpaces'
} as const;

/** Cache key for space members (Edit/About Space panel). Use when prefetching or reading. */
export function getSpaceMembersCacheKey(spaceId: string): string {
  return `spaceMembers:${spaceId}`;
}

/** Cached shape from GET /api/spaces/:spaceId/members (normalized for panel). */
export interface SpaceMembersCache {
  totalMembers: number;
  isOwner: boolean;
  memberLimit: number | null;
  members: any[];
  pendingInvitations: any[];
}
