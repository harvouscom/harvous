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

/** Stable, order-independent hash for seeding per-space rotation salts. */
export function stableStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const REVISIT_POOL_MIN = 5;
const REVISIT_POOL_MAX = 30;

/** Daily rotation pool grows with the backlog so large spaces don't recycle the same few notes. */
function scaledRotationPoolSize(candidateCount: number): number {
  const scaled = Math.round(candidateCount * 0.25);
  return Math.min(REVISIT_POOL_MAX, Math.max(REVISIT_POOL_MIN, scaled));
}

/** Pick from an ordered pool by calendar day + per-space salt; `null` index returns the head. */
function rotatePick<T>(ordered: T[], rotationDayIndex?: number, rotationSalt = 0): T | undefined {
  if (ordered.length === 0) return undefined;
  const pool = ordered.slice(0, scaledRotationPoolSize(ordered.length));
  if (rotationDayIndex == null) return pool[0];
  const idx = (((rotationDayIndex + rotationSalt) % pool.length) + pool.length) % pool.length;
  return pool[idx];
}

const SUBSTANTIVE_CONTENT_MIN = 80;

/** Visible-text length of stored HTML — strips tags/entities so blank scaffolding doesn't count. */
function htmlTextLength(html: string | null | undefined): number {
  if (!html) return 0;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

export type RevisitNoteInput = HomeContinueNoteInput &
  NoteFolderLabelSource & { id?: string; noteType?: string | null; content?: string | null };

/** A note earns "worth another look" over a scratch jotting if it carries real study signal. */
function isSubstantiveNote(note: RevisitNoteInput): boolean {
  if ((note.noteType ?? '') === 'scripture') return true;
  if (noteFolderMembershipLabels(note).length > 0) return true;
  return htmlTextLength(note.content) >= SUBSTANTIVE_CONTENT_MIN;
}

/**
 * Oldest note worth resurfacing — the note with the LEAST-recent edit, excluding
 * blocked ids and anything edited within `minAgeMs`. Substantive study notes
 * (scripture / filed / non-trivial body) are preferred over scratch notes; thin
 * notes only fill the rotation pool when there aren't enough substantive ones.
 * Returns undefined when nothing qualifies (keeps the card hidden for fresh
 * spaces). With `rotationDayIndex`, rotates daily over a pool that scales with the
 * backlog, salted by `rotationSalt` so spaces don't all land on the same pick.
 */
export function pickRevisitNote<T extends RevisitNoteInput>(
  notes: T[],
  options: {
    nowMs: number;
    excludeId?: string;
    excludeIds?: string[];
    minAgeMs: number;
    rotationDayIndex?: number;
    rotationSalt?: number;
  },
): T | undefined {
  const { nowMs, excludeId, excludeIds, minAgeMs, rotationDayIndex, rotationSalt } = options;
  const excluded = new Set<string>();
  if (excludeId) excluded.add(excludeId);
  if (excludeIds) {
    for (const id of excludeIds) excluded.add(id);
  }

  const candidates: Array<{ note: T; t: number }> = [];
  for (const note of notes) {
    if (note.id && excluded.has(note.id)) continue;
    const t = lastEditedTime(note);
    if (t <= 0) continue;
    if (nowMs - t < minAgeMs) continue;
    candidates.push({ note, t });
  }
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => a.t - b.t);

  // Substantive notes first (oldest within each bucket); thin notes only backfill the pool.
  const substantive: T[] = [];
  const thin: T[] = [];
  for (const { note } of candidates) {
    (isSubstantiveNote(note) ? substantive : thin).push(note);
  }
  return rotatePick([...substantive, ...thin], rotationDayIndex, rotationSalt);
}

/**
 * Highlight worth resurfacing on Home. Pinned highlights (deliberate saves) come
 * first, then unpinned; within each bucket the OLDEST-touched surface first so the
 * card is a genuine recall prompt rather than a duplicate of "Continue". Rotates
 * daily over a backlog-scaled, salted pool, skipping `excludeIds` (cooldown).
 */
export function pickRevisitHighlight<T extends { id: string }>(
  rows: T[],
  options: {
    recencyIso: (row: T) => string | null | undefined;
    pinnedIds?: Iterable<string>;
    excludeIds?: Iterable<string>;
    rotationDayIndex?: number;
    rotationSalt?: number;
  },
): T | undefined {
  const { recencyIso, rotationDayIndex, rotationSalt } = options;
  const pinned = new Set(options.pinnedIds ?? []);
  const excluded = new Set(options.excludeIds ?? []);

  const withTime = rows
    .filter((row) => !excluded.has(row.id))
    .map((row) => ({ row, t: Date.parse(recencyIso(row) ?? '') || 0 }));
  if (withTime.length === 0) return undefined;

  withTime.sort((a, b) => a.t - b.t); // oldest first
  const pinnedRows = withTime.filter((x) => pinned.has(x.row.id)).map((x) => x.row);
  const unpinnedRows = withTime.filter((x) => !pinned.has(x.row.id)).map((x) => x.row);
  return rotatePick([...pinnedRows, ...unpinnedRows], rotationDayIndex, rotationSalt);
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
export function localDayIndex(date: Date): number {
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

function formatCasualLastVisitSuffix(lastActivityMs: number, now: Date): string | null {
  const diffSec = Math.round((now.getTime() - lastActivityMs) / 1000);
  if (diffSec < 60) return null;

  const dayDiff = localDayIndex(now) - localDayIndex(new Date(lastActivityMs));
  if (dayDiff === 0) return 'here earlier today';
  if (dayDiff === 1) return 'here yesterday';
  if (dayDiff <= 6) return 'here earlier this week';
  if (dayDiff <= 13) return 'here last week';
  if (dayDiff <= 59) return 'been a while';
  return 'been a long while';
}

export function formatHomeLastActivitySuffix(lastActivityMs: number, now: Date): string | null {
  return formatCasualLastVisitSuffix(lastActivityMs, now);
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
  if (lastActivityMs != null) {
    const lastVisit = formatHomeLastActivitySuffix(lastActivityMs, now);
    if (lastVisit) return lastVisit;
  }
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

/**
 * "Resurface by shared theme" (knowledge layer, Phase 3). A passage with its curated subjects
 * (from the static chapter-subjects index) and the notes that cite it. The consumer resolves
 * subjects per passage; this module stays free of the data file (structural input only).
 */
export interface HomeSubjectNoteBrief {
  id: string;
  title?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}
export interface HomeSubjectPassageInput {
  subjects: string[];
  notes: HomeSubjectNoteBrief[];
}

export interface HomeSubjectConnection {
  subject: string;
  noteCount: number;
  /** Distinct notes touching this subject across passages — most recently edited first. */
  notes: Array<{ id: string; title: string | null }>;
}

function briefTime(note: HomeSubjectNoteBrief): number {
  return normalizeDate(note.updatedAt)?.getTime() ?? normalizeDate(note.createdAt)?.getTime() ?? 0;
}

/**
 * Latent themes connecting a reader's passages: group the notes that cite each passage by the
 * passage's curated subject, then surface subjects shared by ≥ `minNotes` *distinct* notes. This
 * is the connective tissue folders miss — notes on John 3, Romans 8, and 2 Corinthians 5 share
 * "New Birth" even when filed apart. Ranked by reach (note count), then recency.
 */
export function deriveSubjectConnections(
  passages: HomeSubjectPassageInput[],
  options: { limit: number; minNotes?: number; maxNotesPerConnection?: number },
): HomeSubjectConnection[] {
  const { limit, minNotes = 2, maxNotesPerConnection = 6 } = options;
  const bySubject = new Map<string, Map<string, { note: HomeSubjectNoteBrief; t: number }>>();
  for (const passage of passages) {
    if (!passage.notes.length) continue;
    for (const subject of passage.subjects) {
      let notes = bySubject.get(subject);
      if (!notes) {
        notes = new Map();
        bySubject.set(subject, notes);
      }
      for (const note of passage.notes) {
        const t = briefTime(note);
        const prev = notes.get(note.id);
        if (!prev || t > prev.t) notes.set(note.id, { note, t });
      }
    }
  }

  const connections: Array<HomeSubjectConnection & { latest: number }> = [];
  for (const [subject, notes] of bySubject) {
    if (notes.size < minNotes) continue;
    const ranked = [...notes.values()].sort((a, b) => b.t - a.t);
    connections.push({
      subject,
      noteCount: notes.size,
      latest: ranked[0]?.t ?? 0,
      notes: ranked.slice(0, maxNotesPerConnection).map(({ note }) => ({ id: note.id, title: note.title ?? null })),
    });
  }

  return connections
    .sort((a, b) => b.noteCount - a.noteCount || b.latest - a.latest || a.subject.localeCompare(b.subject))
    .slice(0, Math.max(0, limit))
    .map(({ subject, noteCount, notes }) => ({ subject, noteCount, notes }));
}

/**
 * "Resurface by cross-reference" (knowledge layer, Phase 3). A passage with its citing notes
 * plus TSK edges to other cited passages. The consumer resolves edges from the server; this
 * module stays free of DB access (structural input only).
 */
export interface HomeCrossRefPassageInput {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  notes: HomeSubjectNoteBrief[];
}

export interface HomeCrossRefEdge {
  fromKey: string;
  toKey: string;
  votes: number;
}

export interface HomeCrossRefConnection {
  from: { passageKey: string; displayRef: string };
  to: { passageKey: string; displayRef: string };
  votes: number;
  noteCount: number;
  /** Distinct notes across both passages — most recently edited first. */
  notes: Array<{ id: string; title: string | null }>;
}

function canonicalPassagePair(a: HomeCrossRefPassageInput, b: HomeCrossRefPassageInput): [HomeCrossRefPassageInput, HomeCrossRefPassageInput] {
  if (a.bookOrder !== b.bookOrder) return a.bookOrder < b.bookOrder ? [a, b] : [b, a];
  return a.passageKey <= b.passageKey ? [a, b] : [b, a];
}

/**
 * TSK-linked passage pairs in a reader's library: join edges against cited passages, aggregate
 * votes per undirected pair, and surface pairs touching ≥ `minNotes` distinct notes. Ranked by
 * combined TSK votes, then reach (note count), then recency — e.g. Genesis 22 ↔ Hebrews 11.
 */
export function deriveCrossRefConnections(
  passages: HomeCrossRefPassageInput[],
  edges: HomeCrossRefEdge[],
  options: { limit: number; minNotes?: number; maxNotesPerConnection?: number },
): HomeCrossRefConnection[] {
  const { limit, minNotes = 2, maxNotesPerConnection = 6 } = options;
  const byKey = new Map(passages.map((p) => [p.passageKey, p]));

  const pairVotes = new Map<string, { keys: [string, string]; votes: number }>();
  for (const edge of edges) {
    if (edge.fromKey === edge.toKey) continue;
    const from = byKey.get(edge.fromKey);
    const to = byKey.get(edge.toKey);
    if (!from || !to) continue;

    const sorted: [string, string] =
      edge.fromKey < edge.toKey ? [edge.fromKey, edge.toKey] : [edge.toKey, edge.fromKey];
    const pairKey = sorted.join('|');
    const existing = pairVotes.get(pairKey);
    if (existing) existing.votes += edge.votes;
    else pairVotes.set(pairKey, { keys: sorted, votes: edge.votes });
  }

  const connections: Array<HomeCrossRefConnection & { latest: number }> = [];
  for (const { keys, votes } of pairVotes.values()) {
    const passA = byKey.get(keys[0])!;
    const passB = byKey.get(keys[1])!;

    const noteMap = new Map<string, { note: HomeSubjectNoteBrief; t: number }>();
    for (const note of [...passA.notes, ...passB.notes]) {
      const t = briefTime(note);
      const prev = noteMap.get(note.id);
      if (!prev || t > prev.t) noteMap.set(note.id, { note, t });
    }
    if (noteMap.size < minNotes) continue;

    const ranked = [...noteMap.values()].sort((a, b) => b.t - a.t);
    const [fromPass, toPass] = canonicalPassagePair(passA, passB);
    connections.push({
      from: { passageKey: fromPass.passageKey, displayRef: fromPass.displayRef },
      to: { passageKey: toPass.passageKey, displayRef: toPass.displayRef },
      votes,
      noteCount: noteMap.size,
      latest: ranked[0]?.t ?? 0,
      notes: ranked.slice(0, maxNotesPerConnection).map(({ note }) => ({ id: note.id, title: note.title ?? null })),
    });
  }

  return connections
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        b.noteCount - a.noteCount ||
        b.latest - a.latest ||
        a.from.passageKey.localeCompare(b.from.passageKey) ||
        a.to.passageKey.localeCompare(b.to.passageKey),
    )
    .slice(0, Math.max(0, limit))
    .map(({ from, to, votes, noteCount, notes }) => ({ from, to, votes, noteCount, notes }));
}

/**
 * "Resurface by passage" (knowledge layer, Phase 3). A cited passage and the notes that
 * reference it — the consumer maps scripture index passages; this module stays structural only.
 */
export interface HomePassageConnectionInput {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  chapter: number;
  verseStart: number;
  notes: HomeSubjectNoteBrief[];
}

export interface HomePassageConnection {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  noteCount: number;
  /** Distinct notes citing this passage — most recently edited first. */
  notes: Array<{ id: string; title: string | null }>;
}

/**
 * Passages a reader keeps returning to: dedupe citing notes per passage, keep those with ≥
 * `minNotes` distinct notes, ranked by reach (note count), then recency, then canonical order.
 */
export function derivePassageConnections(
  passages: HomePassageConnectionInput[],
  options: { limit: number; minNotes?: number; maxNotesPerConnection?: number },
): HomePassageConnection[] {
  const { limit, minNotes = 2, maxNotesPerConnection = 6 } = options;

  const connections: Array<HomePassageConnection & { latest: number; chapter: number; verseStart: number }> = [];
  for (const passage of passages) {
    if (!passage.notes.length) continue;

    const noteMap = new Map<string, { note: HomeSubjectNoteBrief; t: number }>();
    for (const note of passage.notes) {
      const t = briefTime(note);
      const prev = noteMap.get(note.id);
      if (!prev || t > prev.t) noteMap.set(note.id, { note, t });
    }
    if (noteMap.size < minNotes) continue;

    const ranked = [...noteMap.values()].sort((a, b) => b.t - a.t);
    connections.push({
      passageKey: passage.passageKey,
      displayRef: passage.displayRef,
      bookOrder: passage.bookOrder,
      chapter: passage.chapter,
      verseStart: passage.verseStart,
      noteCount: noteMap.size,
      latest: ranked[0]?.t ?? 0,
      notes: ranked.slice(0, maxNotesPerConnection).map(({ note }) => ({ id: note.id, title: note.title ?? null })),
    });
  }

  return connections
    .sort(
      (a, b) =>
        b.noteCount - a.noteCount ||
        b.latest - a.latest ||
        a.bookOrder - b.bookOrder ||
        a.chapter - b.chapter ||
        a.verseStart - b.verseStart ||
        a.passageKey.localeCompare(b.passageKey),
    )
    .slice(0, Math.max(0, limit))
    .map(({ passageKey, displayRef, bookOrder, noteCount, notes }) => ({
      passageKey,
      displayRef,
      bookOrder,
      noteCount,
      notes,
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
