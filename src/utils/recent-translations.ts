/**
 * Which translations the reader reached for last, so the stack can peek the useful ones.
 *
 * ## Why recency and not the canon order
 *
 * The pile holds every translation; only two of them show an edge. Taking those two from
 * `TRANSLATION_ORDER` would make them an accident of the list — reading in NLT, the next two are
 * NASB and CSB, which is nobody's comparison. Recency makes the flip gesture worth having: the
 * sheet behind is the version you were just in.
 *
 * ## Why this is device-local
 *
 * The translation someone *reads in* is account-synced, on `UserMetadata.defaultTranslation`, and
 * should be — it follows you to a phone. Which two names happen to peek above the page is not
 * that. It is presentation on one device, the same call `onboarding-day-marker.ts` makes for its
 * "led today" flag, and syncing it would mean a device you have not touched in a week deciding
 * what your edges say.
 *
 * ## Why every access is guarded
 *
 * Read during a render. `localStorage` throws rather than returning null in more cases than it
 * looks — private mode, a browser set to block site data, an embedded webview — and `JSON.parse`
 * throws on whatever a half-finished write left behind. An unguarded throw here is a blank reader
 * rather than a missing pair of edges. Same shape as `recent-search-storage.ts`, which settled
 * this for the store it owns.
 */

import { TRANSLATIONS } from '@/data/translations';

export const RECENT_TRANSLATIONS_KEY = 'harvous-recent-translations';

/**
 * How many to remember.
 *
 * More than the two the stack shows, deliberately: the list has to survive the *current* one
 * being filtered out of it, and a reader alternating between two versions would otherwise have
 * nothing left to offer as a second edge.
 */
export const RECENT_TRANSLATIONS_MAX = 6;

export const RECENT_TRANSLATIONS_UPDATED_EVENT = 'recent-translations-updated';

function safeRead(): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RECENT_TRANSLATIONS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWrite(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_TRANSLATIONS_KEY, JSON.stringify(ids));
  } catch {
    /* quota, private mode, storage disabled — the announce below still fires */
  }
}

/**
 * Known ids only, uppercased, de-duplicated, capped.
 *
 * The stored list outlives the translation set: an id retired from `TRANSLATIONS` would
 * otherwise sit in someone's recents forever, drawing an edge that cannot be read.
 */
function normalize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim().toUpperCase();
    if (!id || seen.has(id) || !TRANSLATIONS[id]) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= RECENT_TRANSLATIONS_MAX) break;
  }
  return out;
}

export function readRecentTranslations(): string[] {
  return normalize(safeRead());
}

/** Most recent first. Re-reading one you already have moves it to the front. */
export function recordTranslationUse(id: string): string[] {
  const next = normalize([id, ...readRecentTranslations()]);
  safeWrite(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RECENT_TRANSLATIONS_UPDATED_EVENT));
  }
  return next;
}

/**
 * The translations to draw edges for, nearest first.
 *
 * `current` is excluded rather than filtered by the caller: it is the sheet on top, and an edge
 * offering the page you are already reading is a control that does nothing.
 *
 * Backfilled from `TRANSLATION_ORDER` when recency has too few — a reader on their first visit
 * has used exactly one translation, and one edge above a page reads as a mistake rather than as a
 * stack. `exclude` drops the ones this chapter does not exist in, so the backfill reaches past
 * them instead of stopping short.
 */
export function translationEdges(input: {
  current: string;
  recents: readonly string[];
  order: readonly string[];
  count: number;
  exclude?: readonly string[];
}): string[] {
  const current = input.current.trim().toUpperCase();
  const skip = new Set([current, ...(input.exclude ?? []).map((id) => id.toUpperCase())]);
  const out: string[] = [];

  const take = (id: string) => {
    /* Defensive on the input rather than trusting callers: both lists arrive from outside. */
    if (typeof id !== 'string') return;
    const next = id.trim().toUpperCase();
    if (!next || skip.has(next) || !TRANSLATIONS[next]) return;
    skip.add(next);
    out.push(next);
  };

  for (const id of input.recents) {
    if (out.length >= input.count) break;
    take(id);
  }
  for (const id of input.order) {
    if (out.length >= input.count) break;
    take(id);
  }
  return out.slice(0, Math.max(0, input.count));
}
