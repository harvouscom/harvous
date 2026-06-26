/**
 * localStorage-backed forgetting-curve stability for the prototype Home view (memory layer
 * Workstream B). Each time the user re-engages a resurfaced note (opens the "Worth another look"
 * card), its stability grows — pushing its next forgetting-aware resurfacing further out, the way
 * spaced repetition lengthens intervals after a successful recall. Space-scoped. Mirrors the safe-IO
 * pattern in proto-recall-cooldown.ts and proto-pinned-stores.ts.
 *
 * Stability (in days) feeds `pickRevisitNote`'s `stabilityById`; notes with no entry use the default
 * base stability. No grading — re-engagement is the only signal, kept deterministic and offline.
 */

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

/** Per-note stability (days) for this space — fed to `pickRevisitNote`'s `stabilityById`. */
export function stabilityById(spaceId: string | undefined | null): StabilityMap {
  if (!spaceId) return {};
  return safeRead(spaceId);
}

/** Record that the user re-engaged a resurfaced note, lengthening its forgetting interval. */
export function recordRecallEngaged(spaceId: string | undefined | null, noteId: string): void {
  if (!spaceId || !noteId) return;
  const map = safeRead(spaceId);
  map[noteId] = nextStability(map[noteId]);
  safeWrite(spaceId, map);
}
