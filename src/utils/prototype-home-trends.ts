import { normalizeDate } from './sorting';

/**
 * Pure helpers for the prototype sidebar Home space view: the "continue where
 * you left off" pick and the tag / scripture trend lists. Structural input
 * types only — keep this importable from both web and test contexts.
 */

export interface HomeContinueNoteInput {
  isPinned?: boolean;
  lastVisited?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface HomeTagInput {
  id: string;
  name: string;
  isSystem?: boolean;
  noteCount?: number;
}

export interface HomePassageInput {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  chapter: number;
  verseStart: number;
  referenceCount: number;
  noteCount: number;
}

export interface HomeBookInput {
  bookOrder: number;
  passages: HomePassageInput[];
}

export interface HomeTopTag {
  id: string;
  name: string;
  noteCount: number;
}

export interface HomeTopPassage {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  referenceCount: number;
}

function effectiveTime(note: HomeContinueNoteInput): number {
  let t = 0;
  for (const value of [note.lastVisited, note.updatedAt, note.createdAt]) {
    const date = value != null ? normalizeDate(value) : null;
    if (date) t = Math.max(t, date.getTime());
  }
  return t;
}

/**
 * Most recently visited/edited note regardless of pin state — the sidebar's
 * `sortNotesByLastVisited` floats pinned notes first, so `notes[0]` is the
 * wrong answer for "pick up where you left off".
 */
export function pickContinueNote<T extends HomeContinueNoteInput>(notes: T[]): T | undefined {
  let best: T | undefined;
  let bestTime = -1;
  for (const note of notes) {
    const t = effectiveTime(note);
    if (t > bestTime) {
      best = note;
      bestTime = t;
    }
  }
  return best;
}

/** Top user tags by note count; system tags and unused tags are noise here. */
export function deriveTopTags(tags: HomeTagInput[], limit: number): HomeTopTag[] {
  return tags
    .filter((tag) => !tag.isSystem && (tag.noteCount ?? 0) > 0)
    .sort((a, b) => (b.noteCount ?? 0) - (a.noteCount ?? 0) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit))
    .map((tag) => ({ id: tag.id, name: tag.name, noteCount: tag.noteCount ?? 0 }));
}

export interface HomeActivityStreak {
  unit: 'day' | 'week';
  count: number;
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatHomeNoteCount(count: number, hasMore: boolean): string {
  if (count === 1 && !hasMore) return '1 note';
  return `${count}${hasMore ? '+' : ''} notes`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-midnight epoch day index — streaks count calendar days, not 24h windows. */
function localDayIndex(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / DAY_MS);
}

/**
 * Note-activity streak for the Home greeting. Prefers a run of consecutive
 * days (allowed to start yesterday if today is quiet so far); when that's
 * under 2 days, falls back to consecutive calendar weeks each holding at
 * least one activity day. Null when neither reaches 2 — the chip is omitted.
 */
export function computeActivityStreak(notes: HomeContinueNoteInput[], now: Date): HomeActivityStreak | null {
  const activeDays = new Set<number>();
  for (const note of notes) {
    const t = effectiveTime(note);
    if (t > 0) activeDays.add(localDayIndex(new Date(t)));
  }
  if (activeDays.size === 0) return null;

  const today = localDayIndex(now);
  let dayStart = activeDays.has(today) ? today : activeDays.has(today - 1) ? today - 1 : null;
  if (dayStart != null) {
    let days = 0;
    while (activeDays.has(dayStart - days)) days += 1;
    if (days >= 2) return { unit: 'day', count: days };
  }

  // Weeks anchored to the local Sunday-started week containing `now`; 0 = this
  // week, -1 = last week. Like days, the run may start last week if this week
  // is quiet so far.
  const sundayOfThisWeek = today - now.getDay();
  const activeWeeks = new Set<number>();
  for (const day of activeDays) activeWeeks.add(Math.floor((day - sundayOfThisWeek) / 7));
  const weekStart = activeWeeks.has(0) ? 0 : activeWeeks.has(-1) ? -1 : null;
  if (weekStart != null) {
    let weeks = 0;
    while (activeWeeks.has(weekStart - weeks)) weeks += 1;
    if (weeks >= 2) return { unit: 'week', count: weeks };
  }
  return null;
}

/** Most-referenced passages across the space's scripture index, canonical order as tiebreak. */
export function deriveTopPassages(books: HomeBookInput[], limit: number): HomeTopPassage[] {
  return books
    .flatMap((book) => book.passages)
    .filter((passage) => passage.referenceCount > 0 || passage.noteCount > 0)
    .sort(
      (a, b) =>
        b.referenceCount - a.referenceCount ||
        b.noteCount - a.noteCount ||
        a.bookOrder - b.bookOrder ||
        a.chapter - b.chapter ||
        a.verseStart - b.verseStart,
    )
    .slice(0, Math.max(0, limit))
    .map((passage) => ({
      passageKey: passage.passageKey,
      displayRef: passage.displayRef,
      bookOrder: passage.bookOrder,
      referenceCount: passage.referenceCount,
    }));
}
