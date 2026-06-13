import { normalizeDate } from './sorting';
import { noteFolderMembershipLabels, type NoteFolderLabelSource } from './note-folder-display';

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

export interface HomeTopFolder {
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

/** Top user tags by note count; auto/system tags are folders' job, not greeting chips. */
export function deriveTopTags(tags: HomeTagInput[], limit: number): HomeTopTag[] {
  return tags
    .filter((tag) => !tag.isSystem && (tag.noteCount ?? 0) > 0)
    .sort((a, b) => (b.noteCount ?? 0) - (a.noteCount ?? 0) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit))
    .map((tag) => ({ id: tag.id, name: tag.name, noteCount: tag.noteCount ?? 0 }));
}

/** Top folders (collections) by note membership count. Skips unsorted / My Pile. */
export function deriveTopFolders(notes: NoteFolderLabelSource[], limit: number): HomeTopFolder[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const label of noteFolderMembershipLabels(note)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([name, noteCount]) => ({ name, noteCount }));
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

export interface HomeEncouragementInput {
  noteCount: number;
  hasMoreNotes: boolean;
  streak: HomeActivityStreak | null;
  /** Streak copy already appears in the greeting body — skip streak closers. */
  streakShownInGreeting?: boolean;
  hasTopPassage: boolean;
  hour: number;
  today: Date;
}

const HOME_ENCOURAGEMENT_POOL = [
  'Glad you\'re here.',
  'It\'ll be here when you need it.',
  'Keep at your own pace.',
  'One thought at a time.',
  'Worth coming back to.',
  'Whenever you\'re ready.',
] as const;

function pickDailyEncouragement(today: Date): string {
  const index = localDayIndex(today) % HOME_ENCOURAGEMENT_POOL.length;
  return HOME_ENCOURAGEMENT_POOL[index]!;
}

/**
 * Closing encouragement for the Home greeting — context-specific when stats
 * give a strong signal, otherwise a daily-stable pick from a small pool.
 */
export function pickHomeEncouragement(input: HomeEncouragementInput): string {
  const { noteCount, hasMoreNotes, streak, streakShownInGreeting, hasTopPassage, hour, today } = input;

  if (noteCount === 1 && !hasMoreNotes) {
    return 'It\'s a start.';
  }

  if (streak && !streakShownInGreeting) {
    if (streak.unit === 'week') {
      if (streak.count >= 3) return 'Week after week. That adds up.';
      if (streak.count === 2) return 'Two weeks now. That adds up.';
    }
    if (streak.unit === 'day') {
      if (streak.count >= 7) return 'Day after day. That adds up.';
      if (streak.count >= 2) return 'Good to see you keeping at it.';
    }
  }

  if (hasTopPassage) {
    return 'Those are worth sitting with.';
  }

  if (hour >= 18) {
    return 'Good place to stop for tonight.';
  }

  if (hour < 12) {
    return 'Nice way to open the day.';
  }

  return pickDailyEncouragement(today);
}

/** How strongly the Home greeting can claim a recurring passage habit. */
export type HomePassageGreetingTone = 'single-note' | 'mentioned-once' | 'returning';

export function homePassageGreetingTone(input: {
  noteCount: number;
  hasMoreNotes: boolean;
  referenceCount: number;
}): HomePassageGreetingTone {
  if (input.noteCount === 1 && !input.hasMoreNotes) return 'single-note';
  if (input.referenceCount < 2) return 'mentioned-once';
  return 'returning';
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

export interface HomeActivityRhythm {
  dayOfWeek: number;
  hour: number;
}

const RHYTHM_MIN_SAMPLES = 4;
const RHYTHM_MIN_WINNER_COUNT = 2;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

type RhythmBucketStats = { count: number; latestTime: number };

function buildRhythmHistogram(
  samples: Array<{ bucket: number; time: number }>,
): Map<number, RhythmBucketStats> {
  const buckets = new Map<number, RhythmBucketStats>();
  for (const { bucket, time } of samples) {
    const existing = buckets.get(bucket) ?? { count: 0, latestTime: -1 };
    existing.count += 1;
    existing.latestTime = Math.max(existing.latestTime, time);
    buckets.set(bucket, existing);
  }
  return buckets;
}

function pickRhythmWinner(
  buckets: Map<number, RhythmBucketStats>,
  stableTieBreak: (a: number, b: number) => number,
): { bucket: number; count: number } | null {
  if (buckets.size === 0) return null;
  const ranked = [...buckets.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    if (b[1].latestTime !== a[1].latestTime) return b[1].latestTime - a[1].latestTime;
    return stableTieBreak(a[0], b[0]);
  });
  return { bucket: ranked[0]![0], count: ranked[0]![1].count };
}

/** Most common local weekday + hour from note activity — null when the signal is too thin. */
export function computeActivityRhythm(notes: HomeContinueNoteInput[]): HomeActivityRhythm | null {
  const samples: Array<{ dayOfWeek: number; hour: number; time: number }> = [];
  for (const note of notes) {
    const t = effectiveTime(note);
    if (t <= 0) continue;
    const date = new Date(t);
    samples.push({ dayOfWeek: date.getDay(), hour: date.getHours(), time: t });
  }
  if (samples.length < RHYTHM_MIN_SAMPLES) return null;

  const dayBuckets = buildRhythmHistogram(samples.map((s) => ({ bucket: s.dayOfWeek, time: s.time })));
  const hourBuckets = buildRhythmHistogram(samples.map((s) => ({ bucket: s.hour, time: s.time })));

  const dayWinner = pickRhythmWinner(dayBuckets, (a, b) => a - b);
  const hourWinner = pickRhythmWinner(hourBuckets, (a, b) => a - b);
  if (!dayWinner || !hourWinner) return null;
  if (dayWinner.count < RHYTHM_MIN_WINNER_COUNT || hourWinner.count < RHYTHM_MIN_WINNER_COUNT) {
    return null;
  }

  return { dayOfWeek: dayWinner.bucket, hour: hourWinner.bucket };
}

export function formatRhythmHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h} ${period}`;
}

export function formatActivityRhythm(rhythm: HomeActivityRhythm): string {
  const day = WEEKDAY_NAMES[rhythm.dayOfWeek] ?? 'Unknown';
  return `usually here on ${day}s at ${formatRhythmHour(rhythm.hour)}`;
}

function formatStreakLabel(streak: HomeActivityStreak): string {
  return `${streak.count} ${streak.unit === 'day' ? 'days' : 'weeks'} in a row`;
}

/** Rhythm + streak for the Home greeting — rhythm wins when both exist (4-line budget). */
export function formatHomeActivitySummary(
  rhythm: HomeActivityRhythm | null,
  streak: HomeActivityStreak | null,
): string | null {
  if (rhythm) {
    return `You're ${formatActivityRhythm(rhythm)}.`;
  }
  if (streak) {
    return `You've shown up ${formatStreakLabel(streak)}.`;
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
