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

export interface HomeBookTrendInput {
  bookOrder: number;
  title: string;
  referenceCount: number;
  noteCount: number;
}

export interface HomeTopBook {
  bookOrder: number;
  title: string;
  referenceCount: number;
  noteCount: number;
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

/** Last content/metadata edit — excludes visit-only `lastVisited` bumps. */
function lastEditedTime(note: HomeContinueNoteInput): number {
  let t = 0;
  for (const value of [note.updatedAt, note.createdAt]) {
    const date = value != null ? normalizeDate(value) : null;
    if (date) t = Math.max(t, date.getTime());
  }
  return t;
}

/**
 * Most recently edited note regardless of pin state — the sidebar's
 * `sortNotesByLastVisited` floats pinned notes first, so `notes[0]` is the
 * wrong answer for "pick up where you left off". Visit-only opens are ignored.
 */
export function pickContinueNote<T extends HomeContinueNoteInput>(notes: T[]): T | undefined {
  let best: T | undefined;
  let bestTime = -1;
  for (const note of notes) {
    const t = lastEditedTime(note);
    if (t > bestTime) {
      best = note;
      bestTime = t;
    }
  }
  return best;
}

/**
 * Oldest note worth resurfacing — the note with the LEAST-recent edit,
 * excluding the continue note and anything edited within `minAgeMs`. Returns
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
    const t = lastEditedTime(note);
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

/** How strongly the Home greeting can claim a recurring scripture habit. */
export type HomeBookGreetingTone = 'single-note' | 'mentioned-once' | 'returning';

export type HomeFolderGreetingTone = 'single' | 'growing' | 'returning';

export type HomeTagGreetingTone = 'single' | 'returning';

export type HomeThreadGreetingTone = 'started' | 'returning';

const HOME_EARLY_USER_MAX_NOTES = 4;

export function homeBookGreetingTone(input: {
  noteCount: number;
  hasMoreNotes: boolean;
  referenceCount: number;
  bookNoteCount: number;
}): HomeBookGreetingTone {
  if (input.noteCount === 1 && !input.hasMoreNotes) return 'single-note';
  const wouldReturn =
    (input.bookNoteCount >= 2 && input.referenceCount >= 2) || input.referenceCount >= 3;
  if (!wouldReturn) return 'mentioned-once';
  if (input.noteCount <= HOME_EARLY_USER_MAX_NOTES) return 'mentioned-once';
  return 'returning';
}

export function homeFolderGreetingTone(folderNoteCount: number): HomeFolderGreetingTone {
  if (folderNoteCount <= 1) return 'single';
  if (folderNoteCount === 2) return 'growing';
  return 'returning';
}

export function homeTagGreetingTone(tagNoteCount: number): HomeTagGreetingTone {
  return tagNoteCount <= 1 ? 'single' : 'returning';
}

export function homeThreadGreetingTone(threadNoteCount: number): HomeThreadGreetingTone {
  return threadNoteCount <= 2 ? 'started' : 'returning';
}

/** Lead copy segments — chips are rendered in JSX; these are the text around them. */
export type HomeLeadCopyLayout = {
  beforeChip: string;
  afterChip: string;
  showCount: boolean;
};

export function homeLeadCopyLayout(lead: HomeLeadTheme): HomeLeadCopyLayout {
  switch (lead.kind) {
    case 'thread':
      return {
        beforeChip: lead.tone === 'started' ? 'You started ' : "You've been working through ",
        afterChip: ', with ',
        showCount: true,
      };
    case 'book':
      if (lead.tone === 'single-note') {
        return { beforeChip: 'You added ', afterChip: '', showCount: true };
      }
      if (lead.tone === 'mentioned-once') {
        return { beforeChip: '', afterChip: ' is in your notes, with ', showCount: true };
      }
      return { beforeChip: 'You keep coming back to ', afterChip: ', with ', showCount: true };
    case 'folder':
      if (lead.tone === 'single') {
        return { beforeChip: '', afterChip: ' has a note in it, with ', showCount: true };
      }
      if (lead.tone === 'growing') {
        return { beforeChip: '', afterChip: ' is starting to fill up, with ', showCount: true };
      }
      return { beforeChip: '', afterChip: ' keeps filling up, with ', showCount: true };
    case 'tag':
      if (lead.tone === 'single') {
        return { beforeChip: '', afterChip: ' is on a note, with ', showCount: true };
      }
      return { beforeChip: '', afterChip: ' keeps showing up in your notes, with ', showCount: true };
    default:
      return { beforeChip: 'You have ', afterChip: ' saved so far', showCount: true };
  }
}

export function homeContinueCardEyebrow(noteCount: number): string {
  return noteCount <= 2 ? 'Your latest note' : 'Pick up where you left off';
}

export function homeSpotlightThreadEyebrow(threadNoteCount: number): string {
  return threadNoteCount <= 2 ? 'A study taking shape' : 'Pick a study back up';
}

/** One consolidated greeting lead, chosen from the available trend signals. */
export type HomeLeadTheme =
  | { kind: 'thread'; thread: HomeTopThread; tone: HomeThreadGreetingTone }
  | { kind: 'book'; book: HomeTopBook; tone: HomeBookGreetingTone }
  | { kind: 'folder'; folder: HomeTopFolder; tone: HomeFolderGreetingTone }
  | { kind: 'tag'; tag: HomeTopTag; tone: HomeTagGreetingTone }
  | { kind: 'none' };

export interface HomeLeadThemeInput {
  thread?: HomeTopThread;
  book?: HomeTopBook;
  folder?: HomeTopFolder;
  tag?: HomeTopTag;
  noteCount: number;
  hasMoreNotes: boolean;
  today: Date;
}

/**
 * Picks ONE lead theme for the greeting (keeps it short). Priority is
 * thread > returning book > folder > tag, but when two or more *strong*
 * signals exist the lead rotates by calendar day so Home feels fresh without
 * getting longer. A book is strong only when it's a recurring reference;
 * folders/tags need >=2 notes to count as strong.
 */
export function selectHomeLeadTheme(input: HomeLeadThemeInput): HomeLeadTheme {
  const { thread, book, folder, tag, noteCount, hasMoreNotes, today } = input;
  const bookTone = book
    ? homeBookGreetingTone({
        noteCount,
        hasMoreNotes,
        referenceCount: book.referenceCount,
        bookNoteCount: book.noteCount,
      })
    : null;

  const candidates: Array<{ theme: HomeLeadTheme; strong: boolean }> = [];
  if (thread) {
    const tone = homeThreadGreetingTone(thread.noteCount);
    candidates.push({ theme: { kind: 'thread', thread, tone }, strong: tone === 'returning' });
  }
  if (book && bookTone) {
    candidates.push({ theme: { kind: 'book', book, tone: bookTone }, strong: bookTone === 'returning' });
  }
  if (folder) {
    const tone = homeFolderGreetingTone(folder.noteCount);
    candidates.push({ theme: { kind: 'folder', folder, tone }, strong: tone === 'returning' });
  }
  if (tag) {
    const tone = homeTagGreetingTone(tag.noteCount);
    candidates.push({ theme: { kind: 'tag', tag, tone }, strong: tone === 'returning' });
  }

  const strong = candidates.filter((c) => c.strong);
  if (strong.length >= 2) {
    const idx = ((localDayIndex(today) % strong.length) + strong.length) % strong.length;
    return strong[idx]!.theme;
  }
  return candidates[0]?.theme ?? { kind: 'none' };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-midnight epoch day index — activity counts use calendar days, not 24h windows. */
function localDayIndex(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / DAY_MS);
}

function collectActiveDayIndices(notes: HomeContinueNoteInput[]): Set<number> {
  const activeDays = new Set<number>();
  for (const note of notes) {
    const t = effectiveTime(note);
    if (t > 0) activeDays.add(localDayIndex(new Date(t)));
  }
  return activeDays;
}

/** Distinct local calendar days with note activity in the Sunday-started week containing `now`. */
export function countWeeklyActivityDays(notes: HomeContinueNoteInput[], now: Date): number {
  const activeDays = collectActiveDayIndices(notes);
  if (activeDays.size === 0) return 0;
  const today = localDayIndex(now);
  const sundayOfThisWeek = today - now.getDay();
  let count = 0;
  for (const day of activeDays) {
    if (Math.floor((day - sundayOfThisWeek) / 7) === 0) count += 1;
  }
  return count;
}

/** Latest note activity timestamp from lastVisited, updatedAt, or createdAt. */
export function computeLastActivityTime(notes: HomeContinueNoteInput[]): number | null {
  let best = -1;
  for (const note of notes) {
    const t = effectiveTime(note);
    if (t > best) best = t;
  }
  return best > 0 ? best : null;
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

export function formatRhythmDaypart(hour: number): string {
  if (hour >= 5 && hour < 12) return 'mornings';
  if (hour >= 12 && hour < 18) return 'afternoons';
  if (hour >= 18 && hour < 22) return 'evenings';
  return 'nights';
}

export function formatHomeActivityRhythmSuffix(rhythm: HomeActivityRhythm): string {
  const day = WEEKDAY_NAMES[rhythm.dayOfWeek] ?? 'Unknown';
  return `often on ${day} ${formatRhythmDaypart(rhythm.hour)}`;
}

export function formatHomeWeeklyActivitySuffix(count: number): string | null {
  if (count < 2) return null;
  if (count === 2) return 'twice this week';
  return `${count} times this week`;
}

function formatRelativePastPhrase(lastActivityMs: number, now: Date): string {
  const diffSec = Math.round((now.getTime() - lastActivityMs) / 1000);
  if (diffSec < 60) return 'just now';

  let unit: Intl.RelativeTimeFormatUnit = 'minute';
  let value = Math.floor(diffSec / 60);
  if (value >= 60) {
    value = Math.floor(value / 60);
    unit = 'hour';
    if (value >= 24) {
      value = Math.floor(value / 24);
      unit = 'day';
      if (value >= 14) {
        value = Math.floor(value / 7);
        unit = 'week';
        if (value >= 10) {
          return new Date(lastActivityMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
      }
    }
  }
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  return rtf.format(-value, unit);
}

export function formatHomeLastActivitySuffix(lastActivityMs: number, now: Date): string {
  const relative = formatRelativePastPhrase(lastActivityMs, now);
  if (relative === 'just now') return 'last here just now';
  return `last here ${relative}`;
}

export interface HomeActivityLeadInput {
  rhythm: HomeActivityRhythm | null;
  weeklyDays: number;
  lastActivityMs: number | null;
  now: Date;
  totalNoteCount?: number;
}

const RHYTHM_MIN_TOTAL_NOTES = 6;

/** Rhythm, then weekly activity count, then last visit — comma clauses on the Home lead sentence. */
export function formatHomeActivityLeadSuffix(input: HomeActivityLeadInput): string | null {
  const { rhythm, weeklyDays, lastActivityMs, now, totalNoteCount = 0 } = input;
  if (rhythm && totalNoteCount >= RHYTHM_MIN_TOTAL_NOTES) return formatHomeActivityRhythmSuffix(rhythm);
  const weekly = formatHomeWeeklyActivitySuffix(weeklyDays);
  if (weekly) return weekly;
  if (lastActivityMs != null) return formatHomeLastActivitySuffix(lastActivityMs, now);
  return null;
}

/** Most-referenced books across the space's scripture index, canonical order as tiebreak. */
export function deriveTopBooks(books: HomeBookTrendInput[], limit: number): HomeTopBook[] {
  return books
    .filter((book) => book.referenceCount > 0 || book.noteCount > 0)
    .sort(
      (a, b) =>
        b.referenceCount - a.referenceCount ||
        b.noteCount - a.noteCount ||
        a.bookOrder - b.bookOrder,
    )
    .slice(0, Math.max(0, limit))
    .map(({ bookOrder, title, referenceCount, noteCount }) => ({
      bookOrder,
      title,
      referenceCount,
      noteCount,
    }));
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
