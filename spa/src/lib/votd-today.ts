import type { SpaceNoteRow } from '../hooks/queries/useSpace';
import {
  findScripturePassageWithNotes,
  type ScriptureIndexBookLike,
} from '@/utils/scripture-passage-drill';
import { normalizeScriptureReference } from '@/utils/scripture-detector';

export const VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY = 'votd_passage_card_dismissed_day';

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

export function getVotdDismissedDay(): string {
  try {
    return localStorage.getItem(VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setVotdDismissedToday(): void {
  try {
    localStorage.setItem(VOTD_PASSAGE_CARD_DISMISSED_DAY_KEY, todayCalendarDayKey());
  } catch {
    /* private browsing */
  }
}

export function isVotdPassageCardDismissedToday(): boolean {
  return getVotdDismissedDay() === todayCalendarDayKey();
}

export async function fetchVotdToday(): Promise<VotdToday | null> {
  const tz = browserIanaTimeZone();
  const res = await fetch(`/api/votd/today?tz=${encodeURIComponent(tz)}`, {
    headers: { 'X-Votd-Timezone': tz },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { reference?: string | null; translation?: string | null };
  const reference = (data.reference ?? '').trim();
  if (!reference) return null;
  const translation = (data.translation ?? 'NET').trim() || 'NET';
  return { reference, translation };
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

export function findPersistedDailyPassageNote(
  notes: SpaceNoteRow[],
  reference: string,
): SpaceNoteRow | undefined {
  return notes.find((n) => isPersistedNoteId(n.id) && noteMatchesDailyPassage(n, reference));
}

/** True when a server-backed note (or scripture index) confirms today's passage exists in the space. */
export function hasDailyPassageNote(
  notes: SpaceNoteRow[],
  scriptureBooks: ScriptureIndexBookLike[],
  reference: string,
): boolean {
  if (findScripturePassageWithNotes(scriptureBooks, reference)) return true;
  return findPersistedDailyPassageNote(notes, reference) != null;
}
