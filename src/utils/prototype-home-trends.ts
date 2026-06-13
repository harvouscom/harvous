import { normalizeDate } from './sorting';
import { noteFolderMembershipLabels, type NoteFolderLabelSource } from './note-folder-display';
import { stripServerAutoUntitledNoteTitleForDisplay } from './server-auto-untitled-note-display';

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

export interface HomeThreadInput {
  id: string;
  title: string | null;
  suggestedTitle: string | null;
  hasCustomTitle: boolean;
  noteCount: number;
  updatedAt?: string | null;
}

export interface HomeTopThread {
  id: string;
  title: string;
  noteCount: number;
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

/**
 * Oldest note worth resurfacing — the note with the LEAST-recent activity,
 * excluding the continue note and anything touched within `minAgeMs`. Returns
 * undefined when nothing is old enough (keeps the card hidden for fresh spaces).
 */
export function pickRevisitNote<T extends HomeContinueNoteInput & { id?: string }>(
  notes: T[],
  options: { nowMs: number; excludeId?: string; minAgeMs: number },
): T | undefined {
  const { nowMs, excludeId, minAgeMs } = options;
  let best: T | undefined;
  let bestTime = Infinity;
  for (const note of notes) {
    if (excludeId && note.id === excludeId) continue;
    const t = effectiveTime(note);
    if (t <= 0) continue;
    if (nowMs - t < minAgeMs) continue;
    if (t < bestTime) {
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

/** Notes not filed in any folder — drives the "tidy up" nudge. */
export function countLooseNotes(notes: NoteFolderLabelSource[]): number {
  let loose = 0;
  for (const note of notes) {
    if (noteFolderMembershipLabels(note).length === 0) loose += 1;
  }
  return loose;
}

/** Resolve a thread's display title (manual override wins), or null if unusable. */
function resolveThreadTitle(thread: HomeThreadInput): string | null {
  const raw = thread.hasCustomTitle ? thread.title ?? thread.suggestedTitle : thread.suggestedTitle;
  const cleaned = stripServerAutoUntitledNoteTitleForDisplay(raw ?? '')?.trim();
  return cleaned || null;
}

/**
 * Top study threads — real clusters of connected notes (>=2) with a usable
 * title. Threads are the strongest "topic you keep returning to" signal.
 */
export function deriveTopThread(threads: HomeThreadInput[], limit = 1): HomeTopThread[] {
  return threads
    .map((thread) => ({ thread, title: resolveThreadTitle(thread) }))
    .filter((t): t is { thread: HomeThreadInput; title: string } => t.title != null && t.thread.noteCount >= 2)
    .sort(
      (a, b) =>
        b.thread.noteCount - a.thread.noteCount ||
        (normalizeDate(b.thread.updatedAt)?.getTime() ?? 0) - (normalizeDate(a.thread.updatedAt)?.getTime() ?? 0) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, Math.max(0, limit))
    .map(({ thread, title }) => ({ id: thread.id, title, noteCount: thread.noteCount }));
}

/** Spotlight thread for the Home card — top titled cluster that isn't the greeting's lead. */
export function pickSpotlightThread(
  threads: HomeThreadInput[],
  options?: { excludeId?: string },
): HomeTopThread | undefined {
  return deriveTopThread(threads, threads.length).find((t) => t.id !== options?.excludeId);
}

export interface HomeActivityStreak {
  unit: 'day' | 'week';
  count: number;
}

/** Local-hour greeting bands: 22–1 Up late, 2–4 Almost morning, 5–11 morning, 12–17 afternoon, 18–21 evening. */
export function greetingForHour(hour: number): string {
  if (hour >= 22 || hour < 2) return 'Up late';
  if (hour < 5) return 'Almost morning';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatHomeNoteCount(count: number, hasMore: boolean): string {
  if (count === 1 && !hasMore) return '1 note';
  return `${count}${hasMore ? '+' : ''} notes`;
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

/** One consolidated greeting lead, chosen from the available trend signals. */
export type HomeLeadTheme =
  | { kind: 'thread'; thread: HomeTopThread }
  | { kind: 'passage'; passage: HomeTopPassage; tone: HomePassageGreetingTone }
  | { kind: 'folder'; folder: HomeTopFolder }
  | { kind: 'tag'; tag: HomeTopTag }
  | { kind: 'none' };

export interface HomeLeadThemeInput {
  thread?: HomeTopThread;
  passage?: HomeTopPassage;
  folder?: HomeTopFolder;
  tag?: HomeTopTag;
  noteCount: number;
  hasMoreNotes: boolean;
  today: Date;
}

/**
 * Picks ONE lead theme for the greeting (keeps it short). Priority is
 * thread > returning passage > folder > tag, but when two or more *strong*
 * signals exist the lead rotates by calendar day so Home feels fresh without
 * getting longer. A passage is strong only when it's a recurring reference;
 * folders/tags need >=2 notes to count as strong.
 */
export function selectHomeLeadTheme(input: HomeLeadThemeInput): HomeLeadTheme {
  const { thread, passage, folder, tag, noteCount, hasMoreNotes, today } = input;
  const passageTone = passage
    ? homePassageGreetingTone({ noteCount, hasMoreNotes, referenceCount: passage.referenceCount })
    : null;

  const candidates: Array<{ theme: HomeLeadTheme; strong: boolean }> = [];
  if (thread) candidates.push({ theme: { kind: 'thread', thread }, strong: true });
  if (passage && passageTone) {
    candidates.push({ theme: { kind: 'passage', passage, tone: passageTone }, strong: passageTone === 'returning' });
  }
  if (folder) candidates.push({ theme: { kind: 'folder', folder }, strong: folder.noteCount >= 2 });
  if (tag) candidates.push({ theme: { kind: 'tag', tag }, strong: tag.noteCount >= 2 });

  const strong = candidates.filter((c) => c.strong);
  if (strong.length >= 2) {
    const idx = ((localDayIndex(today) % strong.length) + strong.length) % strong.length;
    return strong[idx]!.theme;
  }
  return candidates[0]?.theme ?? { kind: 'none' };
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

/** Rhythm + streak for the Home greeting — streak wins when both exist (days/weeks, not active time). */
export function formatHomeActivitySummary(
  rhythm: HomeActivityRhythm | null,
  streak: HomeActivityStreak | null,
): string | null {
  if (streak) {
    return `You've shown up ${formatStreakLabel(streak)}.`;
  }
  if (rhythm) {
    return `You're ${formatActivityRhythm(rhythm)}.`;
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
