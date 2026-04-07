import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { db, eq, first } from '../db';
import { VotdPublishHistory } from '../db/schema';
import { VOTD_GENERAL_POOL as VOTD_GENERAL_POOL_RAW } from '../constants/votd-verses';
import { getCalendarVerseForDate } from './votd-calendar';
import { bookFromReference, clampReferenceToMaxVerseSpan } from './votd-reference-bounds';

export type VotdPickSource = 'calendar' | 'pool' | 'override';

export type DailyVersePick = {
  reference: string;
  source: VotdPickSource;
  label: string | null;
};

/** Pool references normalized to at most 2 verses; deduped after clamping. */
export const VOTD_AUTOMATION_POOL: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of VOTD_GENERAL_POOL_RAW) {
    const c = clampReferenceToMaxVerseSpan(r, 2) ?? normalizeScriptureReference(r.trim());
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
})();

function dateStrToUtcNoon(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
}

/** Previous UTC calendar day as YYYY-MM-DD. */
export function utcPreviousCalendarDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Book from VOTD published on this exact UTC date, if any. */
export async function getPublishedBookOnDate(dateStr: string): Promise<string | null> {
  const row = first(
    await db
      .select({ reference: VotdPublishHistory.reference })
      .from(VotdPublishHistory)
      .where(eq(VotdPublishHistory.publishedDate, dateStr)),
  );
  if (!row) return null;
  return bookFromReference(row.reference);
}

/** References already published this calendar year (UTC). */
export async function getUsedReferencesForYear(year: number): Promise<Set<string>> {
  const rows = await db
    .select({ reference: VotdPublishHistory.reference })
    .from(VotdPublishHistory)
    .where(eq(VotdPublishHistory.year, year));
  return new Set(rows.map((r) => r.reference));
}

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/** Prefer variety: drop candidates in `avoidBook` when other books remain. */
function diversifyByBook(candidates: string[], avoidBook: string | null): string[] {
  if (!avoidBook) return candidates;
  const filtered = candidates.filter((r) => bookFromReference(r) !== avoidBook);
  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Pick verse for publish: calendar first, else random unused automation-pool verse.
 * Avoids the same book as yesterday's published VOTD when possible (back-to-back variety).
 */
export async function pickDailyVerseForPublish(dateStr: string): Promise<DailyVersePick> {
  const d = dateStrToUtcNoon(dateStr);
  const cal = getCalendarVerseForDate(d);
  if (cal) {
    return { reference: cal.reference, source: 'calendar', label: cal.label };
  }

  const year = d.getUTCFullYear();
  const used = await getUsedReferencesForYear(year);
  let candidates = VOTD_AUTOMATION_POOL.filter((r) => !used.has(r));
  if (candidates.length === 0) {
    candidates = [...VOTD_AUTOMATION_POOL];
  }

  const yesterdayBook = await getPublishedBookOnDate(utcPreviousCalendarDay(dateStr));
  candidates = diversifyByBook(candidates, yesterdayBook);

  const ref = candidates[randomInt(candidates.length)]!;
  return { reference: ref, source: 'pool', label: null };
}

/**
 * Deterministic pool pick for admin preview (stable for same date + used set + avoid book).
 * `avoidBook` is usually yesterday's book in the preview timeline for variety.
 */
export function pickPoolVerseForPreview(
  dateStr: string,
  usedRefs: Set<string>,
  avoidBook: string | null,
): string {
  let candidates = VOTD_AUTOMATION_POOL.filter((r) => !usedRefs.has(r));
  if (candidates.length === 0) {
    candidates = [...VOTD_AUTOMATION_POOL];
  }
  candidates = diversifyByBook(candidates, avoidBook);

  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (Math.imul(31, h) + dateStr.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % candidates.length;
  return candidates[idx]!;
}
