import type { SpaceNoteRow } from '../hooks/queries/useSpace';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY } from '@/utils/user-cache-keys';

export { VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY };

export type VotdToday = {
  reference: string;
  translation: string;
};

export function browserIanaTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Local-calendar day string (YYYY-MM-DD) — matches native `VotdService.todayCalendarDayKey`. */
export function todayCalendarDayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: browserIanaTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Query value on `/?focus=` that a reminder uses to open Activity on today's passage. */
export const TODAYS_PASSAGE_FOCUS = 'todays-passage';

const VOTD_FORCE_SHOW_DAY_KEY = 'votd_passage_card_force_show_day';

/**
 * The flag is announced, not just written.
 *
 * It is set at the end of a promise chain — the service worker parks the destination in Cache
 * Storage, the client opens that cache, reads the JSON and only then calls `goTo`. On a cold
 * launch from a notification the passage row mounts and reads this well before any of that
 * resolves, so a plain read during render answered "no" and nothing ever asked again: the
 * dismissal it was meant to override is held in `useState`, and sessionStorage is not something
 * React re-renders for. The row stayed hidden for the rest of the day, which is precisely the
 * bug the flag was added to fix.
 *
 * An event gives the row something to subscribe to, so a late write reaches a component that has
 * already decided to render nothing.
 */
export const VOTD_FORCE_SHOW_EVENT = 'harvous:votd-force-show';

function announceForcedTodaysPassage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(VOTD_FORCE_SHOW_EVENT));
  } catch {
    /* ignore */
  }
}

/** Keep today's passage visible on Activity for the rest of this local day. */
export function forceShowTodaysPassageToday(): void {
  try {
    sessionStorage.setItem(VOTD_FORCE_SHOW_DAY_KEY, todayCalendarDayKey());
  } catch {
    /* private browsing */
  }
  /* Outside the try: in private browsing the write throws and the row should still appear,
     because `shouldForceShowTodaysPassage` is not the only reason it may be hidden. */
  announceForcedTodaysPassage();
}

export function shouldForceShowTodaysPassage(): boolean {
  try {
    return sessionStorage.getItem(VOTD_FORCE_SHOW_DAY_KEY) === todayCalendarDayKey();
  } catch {
    return false;
  }
}

export function clearForcedTodaysPassage(): void {
  try {
    sessionStorage.removeItem(VOTD_FORCE_SHOW_DAY_KEY);
  } catch {
    /* private browsing */
  }
  announceForcedTodaysPassage();
}

/** Subscribe to force-show changes, shaped for `useSyncExternalStore`. */
export function subscribeForcedTodaysPassage(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(VOTD_FORCE_SHOW_EVENT, onChange);
  return () => window.removeEventListener(VOTD_FORCE_SHOW_EVENT, onChange);
}

/** The row's anchor, on the wrapper the passage pill renders. */
export const TODAYS_PASSAGE_ANCHOR_ID = 'todays-passage';

/**
 * Bring the row into view, if it is on the page.
 *
 * Suggested sits under Continue, Review and Following, so on a phone the row a reminder is about
 * is well below the fold — rendered, and not seen, which reads as missing. Silent when the row is
 * not there: the caller may be on a sheet that does not carry it, and the reveal is a separate
 * concern from the scroll.
 */
export function scrollToTodaysPassage(): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(TODAYS_PASSAGE_ANCHOR_ID);
  if (!el) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

/**
 * "Not today" belongs to the person who said it.
 *
 * The key was one global string, so on a shared browser — or simply after switching accounts —
 * one reader's dismissal hid the row for the next one until local midnight. It also survived
 * sign-out, because nothing cleared it. Scoped by user id now, with the old key read once so a
 * dismissal made before this change is still honoured for the day it was made.
 */
export function votdDismissedDayKey(userId?: string | null): string {
  const id = (userId ?? '').trim();
  return id ? `${VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY}:${id}` : VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY;
}

export function getVotdDismissedDay(userId?: string | null): string {
  try {
    const scoped = localStorage.getItem(votdDismissedDayKey(userId));
    if (scoped) return scoped;
    return localStorage.getItem(VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setVotdDismissedToday(userId?: string | null): void {
  try {
    localStorage.setItem(votdDismissedDayKey(userId), todayCalendarDayKey());
  } catch {
    /* private browsing */
  }
}

export function isVotdPassageCardDismissedToday(userId?: string | null): boolean {
  return getVotdDismissedDay(userId) === todayCalendarDayKey();
}

/**
 * Throws on a failed request; `null` means today genuinely has no passage.
 *
 * It used to collapse both into `null`, which the query then held for its full hour of
 * `staleTime` — so one blip while the tab was loading meant no passage row until the reader
 * reloaded, with `retry` given nothing to retry because a resolved promise is a success.
 */
export async function fetchVotdToday(): Promise<VotdToday | null> {
  const tz = browserIanaTimeZone();
  const res = await fetch(`/api/votd/today?tz=${encodeURIComponent(tz)}`, {
    credentials: 'include',
    headers: { 'X-Votd-Timezone': tz },
  });
  if (!res.ok) throw new Error(`votd/today ${res.status}`);
  const data = (await res.json()) as { reference?: string | null; translation?: string | null };
  const reference = (data.reference ?? '').trim();
  if (!reference) return null;
  const translation = (data.translation ?? 'NET').trim() || 'NET';
  return { reference, translation };
}

export type VotdEngagementAction = 'dismiss' | 'add_note';

/** Fire-and-forget server tracking for prototype Today's Passage dismiss / add-note. */
export function recordVotdEngagement(action: VotdEngagementAction): void {
  const tz = browserIanaTimeZone();
  void fetch(`/api/votd/record-engagement?tz=${encodeURIComponent(tz)}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Votd-Timezone': tz,
    },
    body: JSON.stringify({ action, tz }),
  }).catch(() => {});
}

function refsEquivalent(a: string, b: string): boolean {
  const na = normalizeScriptureReference(a.trim()) ?? a.trim();
  const nb = normalizeScriptureReference(b.trim()) ?? b.trim();
  if (!na || !nb) return false;
  return na.localeCompare(nb, undefined, { sensitivity: 'accent' }) === 0;
}

export function isPersistedNoteId(id: string): boolean {
  return !id.startsWith('local_');
}

export function noteMatchesDailyPassage(
  row: Pick<SpaceNoteRow, 'title' | 'content'>,
  reference: string,
): boolean {
  const ref = reference.trim();
  if (!ref) return false;
  const title = (row.title ?? '').trim();
  if (title && refsEquivalent(title, ref)) {
    return true;
  }
  const content = row.content ?? '';
  if (!content.includes('data-scripture-reference')) return false;
  const pillRefPattern = /data-scripture-reference\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pillRefPattern.exec(content)) !== null) {
    const pillRef = (match[1] ?? '').trim();
    if (pillRef && refsEquivalent(pillRef, ref)) {
      return true;
    }
  }
  return false;
}

/**
 * Created or last touched on today's local calendar day.
 *
 * Scopes "resume, don't duplicate" to a note actually started on today's reading — not to
 * any note, from any day, that happens to cite the same verse. The daily passage rotates
 * through a finite pool, so a reference recurring months later is common; without this a
 * note from that earlier occurrence would resurface as "today's" note, which reads as the
 * wrong content opening under today's invitation to write.
 */
function wasTouchedToday(
  row: Pick<SpaceNoteRow, 'createdAt' | 'updatedAt'>,
  now: Date = new Date(),
): boolean {
  const today = todayCalendarDayKey(now);
  if (row.createdAt && todayCalendarDayKey(new Date(row.createdAt)) === today) return true;
  return Boolean(row.updatedAt && todayCalendarDayKey(new Date(row.updatedAt)) === today);
}

export function findPersistedDailyPassageNote(
  notes: SpaceNoteRow[],
  reference: string,
): SpaceNoteRow | undefined {
  return notes.find(
    (n) => isPersistedNoteId(n.id) && wasTouchedToday(n) && noteMatchesDailyPassage(n, reference),
  );
}
