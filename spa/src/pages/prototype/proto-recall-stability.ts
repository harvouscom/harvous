/**
 * Forgetting-curve stability for prototype Home (memory layer Workstream B). Server is authoritative
 * via GET /api/notes/fingerprints; localStorage is a fallback when offline or before sync.
 */

import { api } from '../../lib/api';
import { DEFAULT_BASE_STABILITY_DAYS } from '@/utils/prototype-home-trends';

const KEY_PREFIX = 'harvous.prototype.recallStability.';

/** Each re-engagement multiplies stability by this factor (spaced-repetition-style growth). */
export const STABILITY_GROWTH_FACTOR = 2;
/** Upper bound so a heavily-revisited note can still eventually resurface (~6 months). */
export const MAX_STABILITY_DAYS = 180;

type StabilityMap = Record<string, number>;

function key(spaceId: string): string {
  return `${KEY_PREFIX}${spaceId}`;
}

/**
 * Next stability after a re-engagement. Pure so the spaced-repetition math is unit-testable without
 * localStorage. Grows multiplicatively from at least the base, capped at MAX_STABILITY_DAYS.
 */
export function nextStability(
  current: number | undefined,
  base: number = DEFAULT_BASE_STABILITY_DAYS,
): number {
  const start = current != null && Number.isFinite(current) && current > 0 ? current : base;
  return Math.min(MAX_STABILITY_DAYS, Math.round(start * STABILITY_GROWTH_FACTOR));
}

function safeRead(spaceId: string): StabilityMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key(spaceId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: StabilityMap = {};
    for (const [id, days] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof days === 'number' && Number.isFinite(days) && days > 0) out[id] = days;
    }
    return out;
  } catch {
    return {};
  }
}

function safeWrite(spaceId: string, map: StabilityMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(spaceId), JSON.stringify(map));
  } catch {
    // quota / storage disabled — ignore
  }
}

/** Merge server stability with local fallback — higher value wins per note. */
export function mergeStabilityMaps(server: StabilityMap, local: StabilityMap): StabilityMap {
  const out = { ...local };
  for (const [id, days] of Object.entries(server)) {
    out[id] = Math.max(out[id] ?? 0, days);
  }
  return out;
}

/** Per-note stability (days) for this space — local fallback only; prefer server map from fingerprints. */
export function stabilityById(spaceId: string | undefined | null): StabilityMap {
  if (!spaceId) return {};
  return safeRead(spaceId);
}

/**
 * Record that the user re-engaged a resurfaced note. Updates localStorage immediately; syncs to the
 * server in the background. Call `onSynced` after a successful API write (e.g. invalidate fingerprints).
 */
export function recordRecallEngaged(
  spaceId: string | undefined | null,
  noteId: string,
  options?: { onSynced?: () => void },
): void {
  if (!noteId) return;

  if (spaceId) {
    const map = safeRead(spaceId);
    map[noteId] = nextStability(map[noteId]);
    safeWrite(spaceId, map);
  }

  void api
    .post<{ success?: boolean }>('/api/notes/recall-engaged', { noteId })
    .then(() => options?.onSynced?.())
    .catch(() => {
      // offline or table missing — local fallback already applied
    });
}
