import { dayIndex } from '@/utils/note-mark-prompts';
import { normalizeDate } from './sorting';
import { noteFolderMembershipLabels, type NoteFolderLabelSource } from './note-folder-display';
import { stripServerAutoUntitledNoteTitleForDisplay } from './server-auto-untitled-note-display';
import { normalizeScriptureReference, parseScriptureReference } from './scripture-detector';
import { UNIVERSAL_BIBLE_ENTITIES } from '@/utils/universal-bible-entities';

/**
 * Pure helpers for the prototype sidebar Home space view: the "continue where
 * you left off" pick and the tag / scripture trend lists. Structural input
 * types only — keep this importable from both web and test contexts.
 */

export interface HomeContinueNoteInput {
  /**
   * Read by pickContinueNote to honour `excludeIds` — the mechanism that keeps the
   * note you already have open out of "Pick up where you left off". It was absent from
   * this type, so nothing required callers to supply it and the exclusion could silently
   * no-op.
   */
  id?: string;
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
 * The note most recently *worked with*, regardless of pin state — the sidebar's
 * `sortNotesByLastVisited` floats pinned notes first, so `notes[0]` is the wrong answer for
 * "pick up where you left off".
 *
 * Worked with means edited, or read. Visit-only `lastVisited` bumps are still ignored, and
 * that exclusion is still right: the column is stamped by any open at all and cannot tell a
 * mis-tap from a sitting. What counts instead is `lastSubstantiveVisitAtById` — a note held
 * open for a measured stretch of attention, glances already dropped. That is the same kind
 * of fact an edit is, and for someone who reads more than they type it is the only kind
 * they leave.
 *
 * The distinction matters historically: excluding visits here came out of the June 2026 fix
 * for opening a note bumping its `updatedAt`, which is a problem about an accidental write,
 * not about reading.
 */
export function pickContinueNote<T extends HomeContinueNoteInput>(
  notes: T[],
  opts: {
    excludeIds?: Iterable<string>;
    /** noteId → ms of the last read/study visit. Glances are excluded upstream. */
    lastSubstantiveVisitAtById?: Record<string, number>;
  } = {},
): T | undefined {
  const exclude = new Set(opts.excludeIds ?? []);
  let best: T | undefined;
  let bestTime = -1;
  for (const note of notes) {
    if (note.id != null && exclude.has(note.id)) continue;
    const visitMs = note.id != null ? opts.lastSubstantiveVisitAtById?.[note.id] : undefined;
    const t = Math.max(lastEditedTime(note), visitMs != null && visitMs > 0 ? visitMs : 0);
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

/** Default forgetting-curve stability (days) for a note the user hasn't re-engaged via recall. */
export const DEFAULT_BASE_STABILITY_DAYS = 10;

/** Relaxed age gate when the strict revisit pool is empty (e.g. all notes touched within 14 days). */
export const REVISIT_FALLBACK_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Forgetting-aware resurfacing priority (memory layer Workstream B). Higher = resurface sooner.
 * Combines how much study a note represents (`meaningWeight`, 0..1, from its server fingerprint)
 * with how faded it is: retrievability R = exp(-Δt / stability) decays as a note goes untouched, so
 * priority = meaningWeight × (1 − R) peaks for meaningful notes the user is about to forget. Pure.
 * Stability lengthens each time the user re-engages a note, pushing its next resurfacing further out.
 */
export function forgettingAwarePriority(
  meaningWeight: number,
  daysSinceTouch: number,
  stabilityDays: number,
): number {
  const mw = Math.min(1, Math.max(0, meaningWeight));
  const stability = Math.max(1, stabilityDays);
  const days = Math.max(0, daysSinceTouch);
  const retrievability = Math.exp(-days / stability);
  return mw * (1 - retrievability);
}

/** Meaning fallback when a note has no fingerprint yet (pre-backfill): substance-based, mid-range. */
function fallbackMeaningWeight(note: RevisitNoteInput): number {
  return isSubstantiveNote(note) ? 0.5 : 0.25;
}

/**
 * Touch time for Workstream B resurfacing.
 *
 * Measured engagement wins outright; edit time is only the fallback for a note that has
 * none yet. Two things count as measured — opening the note from a recall card, and holding
 * it open for a read or study stretch — and the later of the two is the answer.
 *
 * `updatedAt` deliberately does not count, and cannot: it is bumped by writes that are not
 * engagement at all. The link cleanup in `server/utils/delete-note-cascade.ts` re-stamps
 * every note that mentioned a deleted one, which is nobody reading anything. That is the
 * whole reason this function exists rather than the ranking using `lastEditedTime` directly.
 */
export function revisitTouchTimeMs(
  note: RevisitNoteInput,
  lastRecallEngagedAtById?: Record<string, number>,
  lastSubstantiveVisitAtById?: Record<string, number>,
): number {
  const id = note.id;
  const recallMs = id != null ? lastRecallEngagedAtById?.[id] : undefined;
  const visitMs = id != null ? lastSubstantiveVisitAtById?.[id] : undefined;
  const engaged = Math.max(
    recallMs != null && recallMs > 0 ? recallMs : 0,
    visitMs != null && visitMs > 0 ? visitMs : 0,
  );
  if (engaged > 0) return engaged;
  return lastEditedTime(note);
}

/**
 * Oldest note worth resurfacing — the note with the LEAST-recent edit, excluding
 * blocked ids and anything edited within `minAgeMs`. Substantive study notes
 * (scripture / filed / non-trivial body) are preferred over scratch notes; thin
 * notes only fill the rotation pool when there aren't enough substantive ones.
 * Returns undefined when nothing qualifies (keeps the card hidden for fresh
 * spaces). With `rotationDayIndex`, rotates daily over a pool that scales with the
 * backlog, salted by `rotationSalt` so spaces don't all land on the same pick.
 * When `fallbackMinAgeMs` is set and the strict pool is empty, retries with the
 * relaxed gate ranked by the same forgetting-aware logic. When `tertiaryMinAgeMs` is set and both
 * prior pools are empty, retries once more (e.g. active-continue path with minAge 0).
 */
type PickRevisitNoteOptions = {
  nowMs: number;
  excludeId?: string;
  excludeIds?: string[];
  minAgeMs: number;
  fallbackMinAgeMs?: number;
  tertiaryMinAgeMs?: number;
  rotationDayIndex?: number;
  rotationSalt?: number;
  meaningWeightById?: Record<string, number>;
  stabilityById?: Record<string, number>;
  lastRecallEngagedAtById?: Record<string, number>;
  /** noteId → ms of the last read/study visit. Glances are excluded upstream. */
  lastSubstantiveVisitAtById?: Record<string, number>;
  /** noteId → count of read/study visits in the trailing window. */
  visitCountById?: Record<string, number>;
  baseStabilityDays?: number;
  canonSectionById?: Record<string, string>;
  /** User's overall section distribution from fingerprints. */
  librarySectionCounts?: Record<string, number>;
  /** Sections surfaced in recent recall opens (local store). */
  recentRecallSectionCounts?: Record<string, number>;
};

const RECALL_SECTION_DIVERSITY_MAX_BOOST = 0.1;

/**
 * Small priority boost for notes in canon sections under-represented in recent recall vs the user's
 * library. Pure; returns 0 when inputs are missing or recall history is empty (cold start).
 */
export function recallSectionDiversityBoost(
  sectionId: string | null | undefined,
  libraryCounts: Record<string, number> | undefined,
  recentCounts: Record<string, number> | undefined,
): number {
  if (!sectionId || !libraryCounts || !recentCounts) return 0;
  const libraryTotal = Object.values(libraryCounts).reduce((sum, c) => sum + c, 0);
  const recentTotal = Object.values(recentCounts).reduce((sum, c) => sum + c, 0);
  if (libraryTotal <= 0 || recentTotal <= 0) return 0;

  const libraryShare = (libraryCounts[sectionId] ?? 0) / libraryTotal;
  const recentShare = (recentCounts[sectionId] ?? 0) / recentTotal;
  const gap = libraryShare - recentShare;
  if (gap <= 0) return 0;
  return Math.min(RECALL_SECTION_DIVERSITY_MAX_BOOST, gap * 0.5);
}

/**
 * Cap for the returns boost. Deliberately under RECALL_SECTION_DIVERSITY_MAX_BOOST: diversity
 * corrects a systemic blind spot — a whole canon section going unseen — while this is a nudge
 * about one note. Between them they now spend 0.18 of additive headroom on a priority that
 * realistically peaks near 0.56, which is about as much as this scoring can absorb; a third
 * additive boost would start drowning the term it is supposed to be adjusting.
 */
export const REVISIT_RETURNS_MAX_BOOST = 0.08;

/** Returns past this add nothing — the fifth return is evidence, the twelfth is noise. */
export const REVISIT_RETURNS_SATURATION = 5;

/**
 * Small priority boost for notes you keep coming back to. Pure; 0 for a note read once or
 * never, so a cold library ranks exactly as it did before.
 *
 * Counts *returns*, not visits — the first read is not a return, it is just reading it.
 *
 * This raises priority while a recent visit lowers it, and the two are not in conflict: they
 * are different terms of the same model, which is how spaced repetition has always worked.
 * `forgettingAwarePriority` asks two separate questions — how much is this worth bringing
 * back (meaning), and how faded is it right now (retrievability). The most recent visit
 * answers the second and suppresses the note for a few days. How often you return answers
 * the first, and is evidence about the note that does not expire when you read it. So a note
 * you come back to weekly goes quiet for a day or two after each reading and then returns
 * *higher* than an equally faded note you never go back to. That is the intent.
 */
export function revisitReturnsBoost(visitCount: number | undefined): number {
  if (visitCount == null || !Number.isFinite(visitCount) || visitCount <= 1) return 0;
  const returns = Math.min(REVISIT_RETURNS_SATURATION, visitCount - 1);
  return (
    REVISIT_RETURNS_MAX_BOOST * (Math.log1p(returns) / Math.log1p(REVISIT_RETURNS_SATURATION))
  );
}

/** Build section counts from a noteId → sectionId map (one count per note). */
export function librarySectionCountsFromById(canonSectionById: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sectionId of Object.values(canonSectionById)) {
    if (!sectionId) continue;
    out[sectionId] = (out[sectionId] ?? 0) + 1;
  }
  return out;
}

function pickRevisitNoteWithMinAge<T extends RevisitNoteInput>(
  notes: T[],
  minAgeMs: number,
  options: PickRevisitNoteOptions & { excluded: Set<string> },
): T | undefined {
  const {
    nowMs,
    rotationDayIndex,
    rotationSalt,
    meaningWeightById,
    lastRecallEngagedAtById,
    lastSubstantiveVisitAtById,
    excluded,
  } = options;

  const candidates: Array<{ note: T; t: number }> = [];
  for (const note of notes) {
    if (note.id && excluded.has(note.id)) continue;
    const t = revisitTouchTimeMs(note, lastRecallEngagedAtById, lastSubstantiveVisitAtById);
    if (t <= 0) continue;
    if (nowMs - t < minAgeMs) continue;
    candidates.push({ note, t });
  }
  if (candidates.length === 0) return undefined;

  // Forgetting-aware ranking when meaningWeight map is provided (empty object still enables recall-time touch).
  if (meaningWeightById != null) {
    const baseStability = options.baseStabilityDays ?? DEFAULT_BASE_STABILITY_DAYS;
    const scored = candidates.map(({ note, t }) => {
      const id = note.id;
      const mw = id != null && meaningWeightById[id] != null ? meaningWeightById[id] : fallbackMeaningWeight(note);
      const stability = id != null && options.stabilityById?.[id] != null ? options.stabilityById[id]! : baseStability;
      const daysSinceTouch = (nowMs - t) / DAY_MS;
      const sectionId = id != null ? options.canonSectionById?.[id] : undefined;
      const diversity = recallSectionDiversityBoost(
        sectionId,
        options.librarySectionCounts,
        options.recentRecallSectionCounts,
      );
      const returns = revisitReturnsBoost(id != null ? options.visitCountById?.[id] : undefined);
      return {
        note,
        t,
        priority: forgettingAwarePriority(mw, daysSinceTouch, stability) + diversity + returns,
      };
    });
    scored.sort(
      (a, b) => b.priority - a.priority || a.t - b.t || (a.note.id ?? '').localeCompare(b.note.id ?? ''),
    );
    return rotatePick(scored.map((s) => s.note), rotationDayIndex, rotationSalt);
  }

  candidates.sort((a, b) => a.t - b.t);

  // Substantive notes first (oldest within each bucket); thin notes only backfill the pool.
  const substantive: T[] = [];
  const thin: T[] = [];
  for (const { note } of candidates) {
    (isSubstantiveNote(note) ? substantive : thin).push(note);
  }
  return rotatePick([...substantive, ...thin], rotationDayIndex, rotationSalt);
}

export function pickRevisitNote<T extends RevisitNoteInput>(
  notes: T[],
  options: PickRevisitNoteOptions,
): T | undefined {
  const { excludeId, excludeIds, minAgeMs, fallbackMinAgeMs, tertiaryMinAgeMs } = options;
  const excluded = new Set<string>();
  if (excludeId) excluded.add(excludeId);
  if (excludeIds) {
    for (const id of excludeIds) excluded.add(id);
  }

  const shared = { ...options, excluded };
  const strict = pickRevisitNoteWithMinAge(notes, minAgeMs, shared);
  if (strict) return strict;
  if (fallbackMinAgeMs != null) {
    const fallback = pickRevisitNoteWithMinAge(notes, fallbackMinAgeMs, shared);
    if (fallback) return fallback;
  }
  if (tertiaryMinAgeMs != null) {
    return pickRevisitNoteWithMinAge(notes, tertiaryMinAgeMs, shared);
  }
  return undefined;
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
  // Singular is always "1 note" — even when hasMore is true (a page capped at
  // exactly 1 row), "1+ notes" reads oddly and the distinction isn't worth the
  // awkward phrasing. Plural still shows the "+" since it's meaningful there.
  if (count === 1) return '1 note';
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

/** The name already on screen as the lead chip (book/thread/folder/tag) — for deduping the trailing trend clause. */
export function homeLeadDisplayName(lead: HomeLeadTheme): string | null {
  switch (lead.kind) {
    case 'book':
      return lead.book.title;
    case 'thread':
      return lead.thread.title;
    case 'folder':
      return lead.folder.name;
    case 'tag':
      return lead.tag.name;
    default:
      return null;
  }
}

/**
 * Drops trend candidates that would repeat the lead's name (e.g. lead chip "Romans" and a
 * "lately returning to Romans" trend clause). Crossref titles join two refs with " and ", so
 * each side is checked individually rather than the whole string.
 */
export function excludeRecallCandidatesMatchingName<T extends RecallCandidate & { title: string }>(
  candidates: T[],
  name: string | null,
): T[] {
  const normalized = name?.trim().toLowerCase();
  if (!normalized) return candidates;
  return candidates.filter(
    (c) => !c.title.split(/\s+and\s+/i).some((part) => part.trim().toLowerCase() === normalized),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-midnight epoch day index — activity counts use calendar days, not 24h windows. */
/* Re-exported so Home's many callers keep one import, while the shell can reach the one
   line without pulling this module onto the initial chunk. */
import { localDayIndex } from './local-day-index';
export { localDayIndex };

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

// ─── Study arcs (memory layer Workstream C: "living commentary on your life") ─────
// A study arc is a theme that keeps returning across a user's notes OVER TIME — not a single
// session, but a thread of attention spanning weeks or months. Built purely from each note's
// fingerprint themes (Workstream A) joined with its timestamp, so it surfaces "what God has been
// teaching you lately" grounded entirely in the user's own study. Pure + deterministic.

export interface StudyArcNoteInput {
  id: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  /** Fingerprint themes for this note (prose tags + passage themes). */
  themes: string[];
  /** Fingerprint emotional tone, if any — used for the arc's through-line. */
  emotionalTone?: string | null;
}

export interface StudyArc {
  theme: string;
  /**
   * Distinct notes touching this theme within the window.
   *
   * **Zero from `deriveStudyArcsFromNodes`**, which counts touches rather than notes and so
   * may not claim a number. Copy must treat 0 as "no count to show", not as "no notes".
   */
  noteCount: number;
  /** Node path only: how much the reader has written about this theme. Ranks the arcs. */
  weight?: number;
  firstMs: number;
  lastMs: number;
  spanDays: number;
  /** Most common emotional tone across the arc's notes, or null. */
  dominantTone: string | null;
  /** Note ids ordered earliest → latest (the arc's path). */
  noteIds: string[];
}

export interface StudyArcOptions {
  nowMs: number;
  /** How far back an arc may reach. Default ~6 months. */
  windowMs?: number;
  /** Minimum distinct notes for a theme to count as an arc. */
  minNotes?: number;
  /** Minimum first→last span so a single study session isn't mistaken for an arc. */
  minSpanDays?: number;
  limit?: number;
}

/** Themes too universal to be "a theme God's been teaching you" — they'd match almost everything. */
const ARC_THEME_DENYLIST = UNIVERSAL_BIBLE_ENTITIES;

/**
 * A curated topic label, as a reader should see it.
 *
 * All 6,738 rows in `ScriptureTopics` are lowercase and strip apostrophes, so the label comes
 * through as "gods love". Sentence case fixes most of it; the possessive does not, and 37 of
 * them begin that way — "Gods compassion" in the greeting of a Bible app reads as a typo, and
 * the greeting is the most-read line in the product. Narrow on purpose: this restores the one
 * apostrophe the source data reliably drops, and guesses at nothing else.
 */
export function curatedTopicLabelForDisplay(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const possessive = trimmed.replace(/^gods\s+/i, "God's ");
  return possessive.charAt(0).toUpperCase() + possessive.slice(1);
}

/** A theme has to have been written about at least twice before it is anyone's arc. */
const ARC_NODE_MIN_EXPANSIONS = 2;

const ARC_WINDOW_MS = 180 * DAY_MS;

/** A note's position in an arc: when it was written (createdAt), falling back to last edit. */
function arcNoteTime(note: StudyArcNoteInput): number {
  return normalizeDate(note.createdAt)?.getTime() ?? normalizeDate(note.updatedAt)?.getTime() ?? 0;
}

/** Most frequent non-null value; null on empty or a tie at the top. Pure. */
export function pickDominantTone(tones: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const t of tones) {
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [tone, c] of counts) {
    if (c > bestCount) {
      best = tone;
      bestCount = c;
      tied = false;
    } else if (c === bestCount) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * The strongest recurring theme-over-time in a user's recent notes. Joins each note's fingerprint
 * themes with its timestamp, groups by theme, and keeps those spanning enough notes AND enough time
 * to be a genuine arc (not one sitting). Ranked by reach, then duration. Returns up to `limit`.
 */
export function deriveStudyArcs(notes: StudyArcNoteInput[], options: StudyArcOptions): StudyArc[] {
  const { nowMs, windowMs = ARC_WINDOW_MS, minNotes = 3, minSpanDays = 21, limit = 1 } = options;
  const windowStart = nowMs - windowMs;

  const byTheme = new Map<string, { label: string; entries: Array<{ id: string; t: number; tone: string | null }> }>();
  const idsPerTheme = new Map<string, Set<string>>();

  for (const note of notes) {
    const t = arcNoteTime(note);
    if (t <= 0 || t < windowStart || t > nowMs) continue;
    const tone = note.emotionalTone ?? null;
    const seenThemes = new Set<string>();
    for (const raw of note.themes ?? []) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (ARC_THEME_DENYLIST.has(key) || seenThemes.has(key)) continue;
      seenThemes.add(key);

      let ids = idsPerTheme.get(key);
      if (!ids) {
        ids = new Set();
        idsPerTheme.set(key, ids);
      }
      if (ids.has(note.id)) continue;
      ids.add(note.id);

      let bucket = byTheme.get(key);
      if (!bucket) {
        bucket = { label, entries: [] };
        byTheme.set(key, bucket);
      }
      bucket.entries.push({ id: note.id, t, tone });
    }
  }

  const arcs: StudyArc[] = [];
  for (const { label, entries } of byTheme.values()) {
    if (entries.length < minNotes) continue;
    entries.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    const firstMs = entries[0]!.t;
    const lastMs = entries[entries.length - 1]!.t;
    const spanDays = (lastMs - firstMs) / DAY_MS;
    if (spanDays < minSpanDays) continue;
    arcs.push({
      theme: label,
      noteCount: entries.length,
      firstMs,
      lastMs,
      spanDays,
      dominantTone: pickDominantTone(entries.map((e) => e.tone)),
      noteIds: entries.map((e) => e.id),
    });
  }

  arcs.sort((a, b) => b.noteCount - a.noteCount || b.spanDays - a.spanDays || a.theme.localeCompare(b.theme));
  return arcs.slice(0, Math.max(0, limit));
}

/** One theme node from the reader's Study Bible layer, as an arc input. */
export interface StudyArcThemeNode {
  label: string | null;
  /** How many times study has touched this theme, however it happened. */
  exposureCount: number;
  expansionCount: number;
  firstStudiedAt: string | Date;
  lastSeenAt: string | Date;
}

const toMs = (value: string | Date): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

/**
 * The same arcs, from server-side counts rather than the notes in the browser.
 *
 * `deriveStudyArcs` above needs every note the reader has, which is why it gives up whenever
 * the list is paginated. The Study Bible layer counts as study happens, so this can answer for
 * a reader with two thousand notes and a first page of twenty.
 *
 * **`noteCount` is deliberately 0 here, and the copy must not claim a number.** The layer
 * counts *touches*, not notes: one note citing five verses that all carry the theme "water"
 * gives that theme five exposures. Rendering that as "Across 5 notes" is simply false, and it
 * is what this function did on its first day. Until a node can count distinct notes, the node
 * path earns a since-line and nothing more.
 *
 * The bar is also higher than the note path's. A theme has to have been *written about*
 * (`expansionCount`), not merely met while reading — the topic layer tags broadly enough that
 * exposure alone surfaces "life" and "water" as though they were someone's study.
 *
 * `noteIds` is left to the caller, which has the fingerprints and can match the label back to
 * notes it holds.
 */
export function deriveStudyArcsFromNodes(
  nodes: readonly StudyArcThemeNode[],
  options: StudyArcOptions,
): StudyArc[] {
  const { nowMs, windowMs = ARC_WINDOW_MS, minNotes = 3, minSpanDays = 21, limit = 1 } = options;
  const windowStart = nowMs - windowMs;

  const arcs: StudyArc[] = [];
  for (const node of nodes) {
    const label = node.label?.trim();
    if (!label || ARC_THEME_DENYLIST.has(label.toLowerCase())) continue;

    const lastMs = toMs(node.lastSeenAt);
    const firstMs = Math.max(toMs(node.firstStudiedAt), windowStart);
    if (!Number.isFinite(lastMs) || !Number.isFinite(firstMs)) continue;
    if (lastMs < windowStart || lastMs > nowMs) continue;

    // Written about, not merely met. Exposure alone is the topic layer's breadth, not the
    // reader's attention — it is what put "water" and "life" forward as study arcs.
    if (node.expansionCount < ARC_NODE_MIN_EXPANSIONS) continue;
    if (node.exposureCount + node.expansionCount < minNotes) continue;

    const spanDays = (lastMs - firstMs) / DAY_MS;
    if (spanDays < minSpanDays) continue;

    arcs.push({
      theme: curatedTopicLabelForDisplay(label),
      // See the docblock: touches are not notes, so this path claims no count at all.
      noteCount: 0,
      firstMs,
      lastMs,
      spanDays,
      // Tone lives on note fingerprints, not on the theme node.
      dominantTone: null,
      noteIds: [],
      // Ranked by what the reader wrote, full stop. Exposure deliberately plays no part: it
      // is how broadly the curated layer tags a passage, and a weighted blend of the two let
      // a theme merely cited eight times outrank one written about five.
      weight: node.expansionCount,
    });
  }

  arcs.sort(
    (a, b) =>
      (b.weight ?? 0) - (a.weight ?? 0) ||
      b.spanDays - a.spanDays ||
      a.theme.localeCompare(b.theme),
  );
  return arcs.slice(0, Math.max(0, limit));
}

// ─── Section study arcs (canon section over time) ────────────────────────────────

export interface SectionArcNoteInput {
  id: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  canonSection: string | null;
  canonSectionLabel?: string | null;
  testament?: 'ot' | 'nt' | null;
}

export interface SectionArc {
  sectionId: string;
  sectionLabel: string;
  testament: 'ot' | 'nt' | null;
  noteCount: number;
  firstMs: number;
  lastMs: number;
  spanDays: number;
  noteIds: string[];
}

export interface SectionArcOptions {
  nowMs: number;
  windowMs?: number;
  minNotes?: number;
  minSpanDays?: number;
  limit?: number;
}

/**
 * The strongest recurring canon section over time in a user's recent notes. Groups by fingerprint
 * `canonSection` with the same window/span thresholds as theme arcs.
 */
export function deriveSectionArcs(notes: SectionArcNoteInput[], options: SectionArcOptions): SectionArc[] {
  const { nowMs, windowMs = ARC_WINDOW_MS, minNotes = 3, minSpanDays = 21, limit = 1 } = options;
  const windowStart = nowMs - windowMs;

  const bySection = new Map<
    string,
    { label: string; testament: 'ot' | 'nt' | null; entries: Array<{ id: string; t: number }> }
  >();

  for (const note of notes) {
    const sectionId = note.canonSection?.trim();
    if (!sectionId) continue;
    const t = arcNoteTime(note);
    if (t <= 0 || t < windowStart || t > nowMs) continue;

    let bucket = bySection.get(sectionId);
    if (!bucket) {
      bucket = {
        label: note.canonSectionLabel?.trim() || sectionId,
        testament: note.testament ?? null,
        entries: [],
      };
      bySection.set(sectionId, bucket);
    }
    if (bucket.entries.some((e) => e.id === note.id)) continue;
    bucket.entries.push({ id: note.id, t });
  }

  const arcs: SectionArc[] = [];
  for (const [sectionId, { label, testament, entries }] of bySection) {
    if (entries.length < minNotes) continue;
    entries.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    const firstMs = entries[0]!.t;
    const lastMs = entries[entries.length - 1]!.t;
    const spanDays = (lastMs - firstMs) / DAY_MS;
    if (spanDays < minSpanDays) continue;
    arcs.push({
      sectionId,
      sectionLabel: label,
      testament,
      noteCount: entries.length,
      firstMs,
      lastMs,
      spanDays,
      noteIds: entries.map((e) => e.id),
    });
  }

  arcs.sort(
    (a, b) => b.noteCount - a.noteCount || b.spanDays - a.spanDays || a.sectionLabel.localeCompare(b.sectionLabel),
  );
  return arcs.slice(0, Math.max(0, limit));
}

/** Month name an arc began in, e.g. "January" (same year) or "January 2026" (earlier year). */
export function studyArcSinceLabel(firstMs: number, nowMs: number): string {
  const start = new Date(firstMs);
  const month = start.toLocaleString('en-US', { month: 'long' });
  return start.getFullYear() === new Date(nowMs).getFullYear() ? month : `${month} ${start.getFullYear()}`;
}

/** Human phrase for an arc's emotional through-line, or null when there's no clear tone. */
export function studyArcToneLabel(tone: string | null): string | null {
  if (!tone) return null;
  const map: Record<string, string> = {
    lament: 'often in lament',
    joy: 'often in joy',
    fear: 'often wrestling with fear',
    gratitude: 'often in gratitude',
    hope: 'often reaching for hope',
    conviction: 'often under conviction',
    awe: 'often in awe',
    peace: 'often settling into peace',
  };
  return map[tone] ?? null;
}

/** Month name a section arc began in — reuses theme arc formatting. */
export function sectionArcSinceLabel(firstMs: number, nowMs: number): string {
  return studyArcSinceLabel(firstMs, nowMs);
}

/** Copy for a section arc card, e.g. "Across 5 notes in the Gospels since January". */
export function sectionArcCopy(arc: SectionArc, nowMs: number): string {
  const since = sectionArcSinceLabel(arc.firstMs, nowMs);
  return `Across ${arc.noteCount} notes in ${arc.sectionLabel} since ${since}`;
}

// ─── Recall carousel (Home resurfacing redesign) ─────────────────────────────────
// The Home recall surface is one swipeable carousel of varied, ranked recall opportunities — a
// fading meaningful note, a highlight, a theme taking shape, a passage you return to, a cross-ref —
// instead of a stack of single cards. The pure layer here filters snoozed items, orders by usefulness
// tier with soft variety in the tail, and rotates the tail daily; the view builds the rich (display +
// tap) candidates. Snooze reuses proto-recall-cooldown. See docs/future/MEMORY_LAYER_ASSESSMENT.md.

export type { RecallOpportunityKind } from './recall-opportunity-kinds';
import type { RecallOpportunityKind } from './recall-opportunity-kinds';

/** Kinds that summarize a trend across notes — eligible for the greeting trend line. */
export const RECALL_TREND_KINDS: readonly RecallOpportunityKind[] = [
  'arc',
  'passage',
  'crossref',
  'subject',
  'referenceWord',
];

/** Generative kinds — "go make something new" rather than "revisit". Get a distinct card accent. */
export const RECALL_GENERATIVE_KINDS: readonly RecallOpportunityKind[] = [
  'continueBook',
  'studyPerson',
  'annotateHighlight',
  'reflection',
  'crossrefGap',
  'connectNotes',
  'searchGap',
];

export function isRecallTrendKind(kind: RecallOpportunityKind): boolean {
  return RECALL_TREND_KINDS.includes(kind);
}

export function isRecallGenerativeKind(kind: RecallOpportunityKind): boolean {
  return RECALL_GENERATIVE_KINDS.includes(kind);
}

/**
 * Lower number = shown higher in the recall shelf.
 *
 * These used to encode a belief — memory first, prompts last — and sixty days of
 * `RecallEvents` say the belief was close to backwards. Open rates, from
 * `npm run recall:kind-rates` and written up in `docs/future/RICHER_HOME_RECOMMENDATIONS.md`:
 *
 *   continueBook 31.3% (39 users) · studyPerson 20.0% (3) · crossrefGap 17.9% (23)
 *   subject 17.6% (5) · reflection 16.7% (3) · passage 12.0% (9) · annotateHighlight 10.8% (17)
 *   highlight 9.4% (8) · connectNotes 7.1% (12) · arc 5.6% (3) · revisitNote 5.5% (9)
 *
 * **The confound is what makes this safe to act on, not what makes it unusable.** Tier-0
 * kinds get pinned to the head slot, so their rates are *flattered*. That asymmetry cuts one
 * way: a tier-0 kind with a bad rate is genuinely bad (it had the advantage and still lost),
 * while a tier-1 kind with a good rate may be even better than it looks. So demotions out of
 * tier 0 are well evidenced, and `continueBook`'s 31% is a floor rather than an estimate.
 *
 * Three deliberate restraints:
 * - `revisitNote` moves to 1, not 2. Its number predates visits becoming a ranking signal
 *   (`NoteVisitEvents`, `revisitReturnsBoost`), which is exactly the blind spot that work
 *   closed, so it is owed a re-measurement. Dropping it two tiers would starve it of the
 *   impressions that re-measurement needs — the demotion has to remove the flattery without
 *   removing the kind.
 * - `studyPerson` and `reflection` come up one step, not two. 20% of five impressions is one
 *   open; it is evidence against "worst tier", not evidence for "best".
 * - `referenceWord` does not move. 0% of a single impression says nothing at all, and
 *   demoting an unmeasured kind is how it stays unmeasured forever.
 *
 * Tier 3 is now empty, which is fine: `orderRecallWithSoftVariety` only ever asks whether one
 * tier differs from the last, and `recallKindTier` still falls back to 3 for a kind missing
 * from this table.
 *
 * **Rates measured after this change are not comparable to the table above** — the head slot
 * now goes to a different kind, so the positional confound points somewhere else. Adding a
 * `position` column to `RecallEvents` is what would make any of this decomposable.
 */
export const RECALL_KIND_TIER: Record<RecallOpportunityKind, number> = {
  continueBook: 0,
  crossrefGap: 0,
  revisitNote: 1,
  highlight: 1,
  annotateHighlight: 1,
  arc: 2,
  passage: 2,
  subject: 2,
  crossref: 2,
  referenceWord: 2,
  connectNotes: 2,
  studyPerson: 2,
  reflection: 2,
  /* New kind on a new signal type, so it starts where it cannot take the head slot. It is
     also the only kind that reflects the reader's own words back at them, which is worth
     being quiet about until there is evidence it lands. */
  searchGap: 2,
  /* The five questions that used to be note reviews. Unmeasured here, and starting where it
     cannot take the head slot — the same restraint every new kind gets, and the rates above
     are the argument for it. */
  markNote: 2,
  /* The Thread and link questions Review retired. Unmeasured here, and starting where it cannot
     take the head slot — the restraint every new kind gets. */
  reflectThread: 2,
  /* Reading, which no card has ever been built on. Same restraint: a new signal starts where it
     cannot take the head slot. */
  readingNote: 2,
};

export function recallKindTier(kind: RecallOpportunityKind): number {
  return RECALL_KIND_TIER[kind] ?? 3;
}

export function compareRecallUsefulness<T extends RecallCandidate>(a: T, b: T): number {
  const tierDiff = recallKindTier(a.kind) - recallKindTier(b.kind);
  if (tierDiff !== 0) return tierDiff;
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

/** Greedy soft variety: prefer a different tier than the previous item when one remains. */
export function orderRecallWithSoftVariety<T extends RecallCandidate>(sorted: T[]): T[] {
  if (sorted.length <= 1) return sorted;

  const [head, ...rest] = sorted;
  const ordered: T[] = [head!];
  const remaining = [...rest];
  let prevTier = recallKindTier(head!.kind);

  while (remaining.length > 0) {
    let pickIdx = remaining.findIndex((item) => recallKindTier(item.kind) !== prevTier);
    if (pickIdx < 0) pickIdx = 0;
    const picked = remaining.splice(pickIdx, 1)[0]!;
    ordered.push(picked);
    prevTier = recallKindTier(picked.kind);
  }

  return ordered;
}

/** Minimal shape the selection logic needs; the view extends this with display + tap handlers. */
export interface RecallCandidate {
  /** Stable id for snooze + React key: note/highlight id, or synthetic ('arc:grace', 'book:Romans:8'). */
  id: string;
  kind: RecallOpportunityKind;
  /** Strength within its kind (normalized ~0..1 so kinds compare sensibly). */
  score: number;
  /** Generative ("go make something new") vs revisit — drives a distinct card accent. */
  isGenerative?: boolean;
}

export interface SelectRecallOptions {
  snoozedIds?: Iterable<string>;
  /** Calendar day index (localDayIndex) — rotates the set daily; omit to keep insertion order. */
  dayIndex?: number;
  rotationSalt?: number;
  limit?: number;
}

/**
 * Order recall candidates for the carousel: drop snoozed ids, sort by usefulness tier + score, apply
 * soft variety in the tail (avoid back-to-back same-tier when possible), pin the best item first,
 * rotate only the tail daily. Pure and deterministic. New candidates appear as soon as included.
 */
export function selectRecallOpportunities<T extends RecallCandidate>(
  candidates: T[],
  options: SelectRecallOptions = {},
): T[] {
  const snoozed = new Set(options.snoozedIds ?? []);
  const limit = options.limit ?? 6;

  // Callers assemble candidates from a dozen independent push sites, several of which can
  // surface the same underlying row — the spotlight highlight and the continue-book chapter
  // lookup resolve to a byte-identical id whenever they land on the same chapter. Both
  // consumers key on `id`, so a duplicate is a React duplicate-key error as well as a card the
  // reader sees twice. Deduping here covers every push site at once, which is why it belongs
  // in the pure function rather than at each call site.
  const seen = new Set<string>();
  const live = candidates.filter((c) => {
    if (snoozed.has(c.id) || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  if (live.length === 0) return [];

  const sorted = [...live].sort(compareRecallUsefulness);
  const varied = orderRecallWithSoftVariety(sorted);

  const head = varied[0]!;
  let tail = varied.slice(1);

  // The offset is taken modulo `tail.length`, so this rotation is inherently sensitive to how
  // many candidates exist: if membership changes, everything in the tail moves. That is fine —
  // and unavoidable for a rotation — *provided* it only ever runs on a settled list. It is the
  // caller's job to not render a half-assembled deck; Home does that via
  // `isPrototypeHomePresentationReady`, which is why every query feeding this must be in that
  // gate. Five were missing and each late arrival reshuffled the deck under the reader.
  if (options.dayIndex != null && tail.length > 1) {
    const salt = options.rotationSalt ?? 0;
    const offset = (((options.dayIndex + salt) % tail.length) + tail.length) % tail.length;
    tail = [...tail.slice(offset), ...tail.slice(0, offset)];
  }

  return [head, ...tail].slice(0, Math.max(0, limit));
}

/** Strongest trend candidate (for the greeting trend line), ignoring snooze (the line isn't dismissible). */
export function pickRecallTrend<T extends RecallCandidate>(candidates: T[]): T | undefined {
  let best: T | undefined;
  for (const c of candidates) {
    if (!isRecallTrendKind(c.kind)) continue;
    if (!best || c.score > best.score || (c.score === best.score && c.id.localeCompare(best.id) < 0)) {
      best = c;
    }
  }
  return best;
}

export interface RecallTrendLineInput {
  kind: RecallOpportunityKind;
  theme?: string;
  subject?: string;
  noteCount?: number;
  since?: string;
  toneLabel?: string | null;
  passageRef?: string;
  fromRef?: string;
  toRef?: string;
  referenceWord?: string;
}

/** One-sentence greeting trend line for the strongest trend opportunity. Pure. */
export function recallTrendLine(input: RecallTrendLineInput): string {
  switch (input.kind) {
    case 'arc': {
      const base = `Lately you keep returning to ${input.theme ?? 'a theme'}`;
      const since = input.since ? ` — across ${input.noteCount ?? 0} notes since ${input.since}` : '';
      const tone = input.toneLabel ? `, ${input.toneLabel}` : '';
      return `${base}${since}${tone}.`;
    }
    case 'subject':
      return `${input.subject ?? 'A theme'} is taking shape across ${input.noteCount ?? 0} of your notes.`;
    case 'passage':
      return `You keep returning to ${input.passageRef ?? 'a passage'}.`;
    case 'crossref':
      return `${input.fromRef ?? 'Two passages'} and ${input.toRef ?? ''} keep surfacing together in your notes.`.replace(' and .', '.');
    case 'referenceWord':
      return `You keep looking up ${input.referenceWord ?? 'a word'} across your notes.`;
    default:
      return '';
  }
}

/** Inline greeting fragments — chip labels + prose prefix/suffix (no note counts or em dashes). */
export interface RecallTrendGreetingParts {
  prefix: string;
  labels: string[];
  suffix: string;
}

export function recallTrendGreetingParts(input: RecallTrendLineInput): RecallTrendGreetingParts | null {
  switch (input.kind) {
    case 'arc': {
      const theme = input.theme?.trim();
      if (!theme) return null;
      return { prefix: ', lately returning to ', labels: [theme], suffix: '' };
    }
    case 'subject': {
      const subject = input.subject?.trim();
      if (!subject) return null;
      return { prefix: ', ', labels: [subject], suffix: ' keeps taking shape' };
    }
    case 'passage': {
      const passageRef = input.passageRef?.trim();
      if (!passageRef) return null;
      return { prefix: ', often back at ', labels: [passageRef], suffix: '' };
    }
    case 'crossref': {
      const fromRef = input.fromRef?.trim();
      const toRef = input.toRef?.trim();
      if (!fromRef || !toRef) return null;
      return { prefix: ', lately ', labels: [fromRef, toRef], suffix: ' keep surfacing together' };
    }
    case 'referenceWord': {
      const referenceWord = input.referenceWord?.trim();
      if (!referenceWord) return null;
      return { prefix: ', often looking up ', labels: [referenceWord], suffix: '' };
    }
    default:
      return null;
  }
}

/** Recall carousel eyebrow for connect-suggestion cards. */
export function connectSuggestionRecallEyebrow(): string {
  return 'Thread these notes';
}

const CONNECT_SUGGESTION_TITLE_MAX = 72;

function cleanConnectSuggestionNoteTitle(title: string | null | undefined): string {
  return stripServerAutoUntitledNoteTitleForDisplay(title?.trim() ?? '')?.trim() || 'Untitled note';
}

/** Recall carousel title for a connect-suggestion pair (natural join, truncated). */
export function formatConnectSuggestionTitle(noteATitle: string, noteBTitle: string): string {
  const a = cleanConnectSuggestionNoteTitle(noteATitle);
  const b = cleanConnectSuggestionNoteTitle(noteBTitle);
  const joined = `${a} and ${b}`;
  if (joined.length <= CONNECT_SUGGESTION_TITLE_MAX) return joined;
  return `${joined.slice(0, CONNECT_SUGGESTION_TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * Recall carousel meta for connect-suggestion cards.
 *
 * Names the thing the pair share when the server could identify it, because "Both cite
 * Romans 8" is a reason to tap and "Both cite the same passage" is a riddle.
 */
export function connectSuggestionRecallMeta(reason: string, sharedSubject?: string): string {
  const subject = sharedSubject?.trim();
  if (subject) {
    switch (reason) {
      case 'Shared passage':
        return `Both cite ${subject}`;
      case 'Cross-reference':
        return `Cross-referenced through ${subject}`;
      case 'Shared theme':
        return `Both on ${subject}`;
      default:
        return `Both touch ${subject}`;
    }
  }
  switch (reason) {
    case 'Shared passage':
      return 'Both cite the same passage';
    case 'Cross-reference':
      return 'You cross-referenced these';
    case 'Shared theme':
      return 'Same theme in both';
    default:
      return 'These notes fit together';
  }
}

/**
 * Prefill for the New thread sheet name field from a suggested pair.
 *
 * What the notes are *about* beats what they are called. Joining the two titles with
 * "and" describes the pair rather than naming the study, and it stops being a name at
 * all once either title is long — so the shared subject is used whenever the server
 * managed to identify one. A thread over two notes that both work through Romans 8
 * should arrive called "Romans 8", which is a name someone would keep.
 */
export function suggestConnectThreadName(
  noteATitle: string,
  noteBTitle: string,
  reason: string,
  sharedSubject?: string,
): string {
  const subject = sharedSubject?.trim();
  // A name is a title, not a sentence fragment. Topic labels are stored lowercase
  // ("assurance"), which is right for the meta line that reads "Both on assurance" and
  // wrong for the thread this is about to be called. Passage subjects already start
  // capitalised, so this only ever touches the themes.
  if (subject && subject.length <= 80) return subject.charAt(0).toUpperCase() + subject.slice(1);

  const a = cleanConnectSuggestionNoteTitle(noteATitle);
  const b = cleanConnectSuggestionNoteTitle(noteBTitle);
  const pair = `${a} and ${b}`;
  if (pair.length <= 80) return pair;
  switch (reason) {
    case 'Shared passage':
      return 'Shared passage';
    case 'Cross-reference':
      return 'Cross-reference study';
    case 'Shared theme':
      return 'Shared theme';
    default:
      return a.length <= 80 ? a : a.slice(0, 79).trimEnd() + '…';
  }
}

/** Recall carousel meta for continue-book generative cards. */
export function continueBookRecallMeta(book: string, chapter: number): string {
  return `Pick up at ${book} ${chapter}`;
}

/** Recall carousel meta for recurring-person generative cards. */
export function recurringPersonRecallMeta(noteCount: number): string {
  const n = noteCount === 1 ? '1 note' : `${noteCount} notes`;
  return `Showed up in ${n}`;
}

/** Recall carousel meta for cross-ref gap generative cards. */
export function crossRefGapRecallMeta(fromDisplayRef: string, toDisplayRef: string): string {
  return `From ${fromDisplayRef} · explore ${toDisplayRef}`;
}

// ─── Generative recall: pure derivations ─────────────────────────────────────────
// Cards that prompt creating something new, computed from data already on Home. Each derive is pure;
// the view turns the result into a RecallOpportunity (display + tap → seed a draft note / annotate).

/** Universal names too broad to suggest "start a note about them". Shared with study arcs. */
const GENERATIVE_PERSON_DENYLIST = UNIVERSAL_BIBLE_ENTITIES;

// 1. Continue the book ──────────────────────────────────────────────────────────

export interface ContinueBookInput {
  /** Book title, e.g. "Romans". */
  book: string;
  bookOrder: number;
  /** Chapters of this book the user has cited (any order, may repeat). */
  citedChapters: number[];
  /**
   * Chapters of this book the user has read without necessarily writing about them.
   * Counts as studied for the same reason citing does — this card exists to avoid
   * proposing a chapter someone has already been through.
   */
  readChapters?: number[];
}

export interface ContinueBookSuggestion {
  book: string;
  bookOrder: number;
  nextChapter: number;
  citedCount: number;
}

/**
 * For each book the user is working through, the next unstudied chapter — the first chapter in
 * 1..N (N = canonical chapter count) they have neither cited nor read. Books fully covered up
 * to N are skipped. Ranked by how much of the book they have been through (most-invested book
 * first). Pure.
 *
 * Reading counts alongside citing because the card's job is to name a chapter someone has not
 * been through yet. Before the reading log existed this could only see citations, so it would
 * cheerfully propose a chapter that had been read twice and simply never written about.
 */
export function deriveContinueBook(
  books: ContinueBookInput[],
  chapterCounts: Map<string, number>,
  opts: { limit?: number } = {},
): ContinueBookSuggestion[] {
  const { limit = 3 } = opts;
  const out: ContinueBookSuggestion[] = [];
  for (const b of books) {
    const total = chapterCounts.get(b.book);
    if (!total) continue;
    const inRange = (c: number) => c >= 1 && c <= total;
    const cited = new Set(b.citedChapters.filter(inRange));
    const covered = new Set([...cited, ...(b.readChapters ?? []).filter(inRange)]);
    if (covered.size === 0) continue;
    let next: number | null = null;
    for (let c = 1; c <= total; c++) {
      if (!covered.has(c)) {
        next = c;
        break;
      }
    }
    if (next == null) continue; // book fully covered
    out.push({ book: b.book, bookOrder: b.bookOrder, nextChapter: next, citedCount: covered.size });
  }
  out.sort((a, b) => b.citedCount - a.citedCount || a.bookOrder - b.bookOrder);
  return out.slice(0, Math.max(0, limit));
}

// 1b. Continue reading ───────────────────────────────────────────────────────────

export interface ContinueReadingInput {
  /** Where the reader was last, from `UserMetadata.lastReadPosition`. */
  lastRead: {
    book: string;
    bookOrder: number;
    chapter: number;
    translation: string;
    /** How far into the chapter they got, when the surface recorded one. */
    verse?: number;
  } | null;
  /** Chapters the reader has been through, from the reading log. */
  readChapters: { book: string; chapter: number; countsAsRead: boolean }[];
}

export interface ContinueReadingSuggestion {
  book: string;
  bookOrder: number;
  chapter: number;
  translation: string;
  /**
   * `resume` — the chapter they opened but did not read through, offered again.
   * `next`   — the following chapter, because the last one was actually read.
   */
  reason: 'resume' | 'next';
  /**
   * The verse to land on, set only when resuming a chapter that was left partway through.
   * A `next` chapter has never been read, so it has no position to restore — and verse 1 is
   * where it opens anyway.
   */
  resumeVerse?: number;
}

/**
 * The chapter to offer someone who was reading. Pure.
 *
 * Two cases, and the difference matters more than it looks. Someone who read a chapter through
 * wants the next one. Someone who opened a chapter and bounced off it — closed the laptop,
 * got interrupted — wants that same chapter again, and offering them the one after it silently
 * skips a chapter they never read. The reading log's dwell bucket is what tells these apart;
 * nothing else in the app can.
 *
 * Returns null once the book runs out rather than rolling into the next one. Where to go after
 * finishing a book is a real question, and answering it by silently starting Leviticus is worse
 * than leaving the slot to the other Home cards.
 */
export function deriveContinueReading(
  input: ContinueReadingInput,
  chapterCounts: Map<string, number>,
): ContinueReadingSuggestion | null {
  const { lastRead, readChapters } = input;
  if (!lastRead) return null;

  const total = chapterCounts.get(lastRead.book);
  if (!total || lastRead.chapter < 1 || lastRead.chapter > total) return null;

  const readThrough = new Set(
    readChapters.filter((r) => r.book === lastRead.book && r.countsAsRead).map((r) => r.chapter),
  );

  const base = {
    book: lastRead.book,
    bookOrder: lastRead.bookOrder,
    translation: lastRead.translation,
  };

  if (!readThrough.has(lastRead.chapter)) {
    return {
      ...base,
      chapter: lastRead.chapter,
      reason: 'resume',
      // Verse 1 is not a position worth restoring — it is where the chapter opens regardless,
      // and putting it on the URL would focus a verse nobody chose.
      ...(lastRead.verse && lastRead.verse > 1 ? { resumeVerse: lastRead.verse } : {}),
    };
  }

  for (let c = lastRead.chapter + 1; c <= total; c++) {
    if (!readThrough.has(c)) return { ...base, chapter: c, reason: 'next' };
  }

  return null;
}

// 1b-ii. Write about what you read ───────────────────────────────────────────────

export interface ReadingNoteChapterInput {
  book: string;
  bookOrder: number;
  chapter: number;
  /** When it was last actually read — glances excluded. Null means it was only glanced at. */
  lastReadAt: string | null;
  translation?: string | null;
}

export interface ReadingNoteSuggestion {
  book: string;
  bookOrder: number;
  chapter: number;
  readAt: string;
  translation: string | null;
}

/**
 * The chapter worth writing about: the most recently read one, inside the window, that no note
 * of theirs already cites.
 *
 * Three exclusions, each with a reason.
 *
 * **A glance is not a read.** `lastReadAt` is null for a chapter only ever glanced at, and the
 * card says "you read this" — which would be untrue.
 *
 * **A chapter already cited is not a gap.** If a note quotes John 3, the reader has written
 * about John 3, and offering to start one is offering something they already did. This is the
 * same rule `deriveContinueBook` applies to its own candidates.
 *
 * **Old reading is not news.** Past the window the invitation stops being "while it is fresh"
 * and becomes a chore list of everything unwritten, which is the shape this shelf refuses.
 *
 * The window is in **calendar days in the reader's own zone**, not elapsed hours, because that
 * is how the card's eyebrow speaks — "you read this today", "yesterday". Measured in hours the
 * two disagree: a chapter read at eight last night is twenty hours old, inside a two-day
 * window, and two calendar days back if you open Home the morning after next. The card was
 * then derived and silently dropped for want of an eyebrow. One notion of a day, used by both.
 */
export function deriveReadingNote(
  input: {
    readChapters: readonly ReadingNoteChapterInput[];
    /** `${book}|${chapter}` for every chapter the reader's notes cite. */
    citedChapterKeys: ReadonlySet<string>;
    windowDays?: number;
  },
  now: Date = new Date(),
): ReadingNoteSuggestion | null {
  // 1: today or yesterday, which is exactly what the eyebrow can say.
  const windowDays = input.windowDays ?? 1;
  const today = dayIndex(now);
  let best: ReadingNoteSuggestion | null = null;
  let bestAt = -Infinity;

  for (const chapter of input.readChapters) {
    if (!chapter.lastReadAt || !chapter.book || !Number.isInteger(chapter.chapter)) continue;
    const readAt = new Date(chapter.lastReadAt);
    const at = readAt.getTime();
    if (!Number.isFinite(at)) continue;
    const age = today - dayIndex(readAt);
    if (age < 0 || age > windowDays) continue;
    if (input.citedChapterKeys.has(`${chapter.book}|${chapter.chapter}`)) continue;
    if (at <= bestAt) continue;
    bestAt = at;
    best = {
      book: chapter.book,
      bookOrder: chapter.bookOrder,
      chapter: chapter.chapter,
      readAt: chapter.lastReadAt,
      translation: chapter.translation ?? null,
    };
  }
  return best;
}

/** Home card copy for continue-reading. */
/**
 * Names the place the row will actually land you.
 *
 * Resuming carries the verse when there is one, because the row now returns you to it rather
 * than to the top of the chapter. Saying "Back to Romans 5" while landing on Romans 5:8 is a
 * small lie that costs trust in the one card whose whole promise is remembering where you were.
 */
export function continueReadingMeta(suggestion: ContinueReadingSuggestion): string {
  if (suggestion.reason !== 'resume') return `Next in ${suggestion.book}`;
  const at = suggestion.resumeVerse
    ? `${suggestion.book} ${suggestion.chapter}:${suggestion.resumeVerse}`
    : `${suggestion.book} ${suggestion.chapter}`;
  return `Back to ${at}`;
}

export function continueReadingEyebrow(suggestion: ContinueReadingSuggestion): string {
  return suggestion.reason === 'resume' ? 'Where you left off reading' : 'Keep reading';
}

// 1c. Smart jump ─────────────────────────────────────────────────────────────────

export interface SmartJumpDestination {
  book: string;
  chapter: number;
  /** The verse to focus on arrival, when the source named one. */
  verse: number | null;
  /** Carried only from a reading position, so continuing never switches translation. */
  translation: string | null;
  /** Which of the three sources answered. */
  source: 'continue' | 'votd' | 'fallback';
}

/**
 * Where a bare "open the reader" lands. Pure, and always answers.
 *
 * The Home cards each gate themselves independently — continue-reading needs a reading
 * position, the passage card needs a verse of the day — which is right for a card that can
 * simply not render. A permanent control cannot do that: it is on screen for a brand new
 * account with no history and no verse of the day, so the last step has to be unconditional.
 *
 * Genesis 1, matching the first-run passage the empty Home already offers.
 */
export function deriveSmartJumpDestination(
  continueReading: ContinueReadingSuggestion | null,
  votdDestination: { book: string; chapter: number; verse: number | null } | null,
): SmartJumpDestination {
  if (continueReading) {
    return {
      book: continueReading.book,
      chapter: continueReading.chapter,
      // Only a resumed chapter has a verse to return to; `next` opens at the top.
      verse: continueReading.resumeVerse ?? null,
      translation: continueReading.translation || null,
      source: 'continue',
    };
  }

  if (votdDestination) {
    return {
      book: votdDestination.book,
      chapter: votdDestination.chapter,
      verse: votdDestination.verse,
      translation: null,
      source: 'votd',
    };
  }

  return { book: 'Genesis', chapter: 1, verse: null, translation: null, source: 'fallback' };
}

// 2. Study a recurring person ─────────────────────────────────────────────────────

export interface RecurringPersonInput {
  noteId: string;
  title: string | null;
  /** Fingerprint people for this note. */
  people: string[];
}

export interface RecurringPersonSuggestion {
  name: string;
  noteCount: number;
}

/**
 * A person who appears across several notes but has no note "about" them yet (proxy: no note title
 * contains their name). Universal names are excluded. Ranked by reach. Pure. Suggests a focused study.
 */
export function deriveRecurringPerson(
  notes: RecurringPersonInput[],
  opts: { minNotes?: number; limit?: number } = {},
): RecurringPersonSuggestion[] {
  const { minNotes = 3, limit = 3 } = opts;

  const noteIdsByPerson = new Map<string, { display: string; ids: Set<string> }>();
  const titledPeople = new Set<string>();
  for (const note of notes) {
    const title = (note.title ?? '').toLowerCase();
    const seen = new Set<string>();
    for (const raw of note.people ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (GENERATIVE_PERSON_DENYLIST.has(key) || seen.has(key)) continue;
      seen.add(key);
      const entry = noteIdsByPerson.get(key) ?? { display: name, ids: new Set<string>() };
      entry.ids.add(note.noteId);
      noteIdsByPerson.set(key, entry);
      if (title.includes(key)) titledPeople.add(key);
    }
  }

  const out: RecurringPersonSuggestion[] = [];
  for (const [key, entry] of noteIdsByPerson) {
    if (titledPeople.has(key)) continue; // already has a note about them
    if (entry.ids.size < minNotes) continue;
    out.push({ name: entry.display, noteCount: entry.ids.size });
  }
  out.sort((a, b) => b.noteCount - a.noteCount || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(0, limit));
}

// 3. Recurring dictionary reference words ─────────────────────────────────────────

export interface HomeReferenceWordInput {
  id: string;
  entryKind?: string | null;
  sourceSnippet?: string | null;
  anchorTextSnapshot?: string | null;
  focusTitle?: string | null;
  parentNoteId: string;
  /** Touch time (ms) — most recent reference row wins for onOpen. */
  recencyMs?: number;
}

export interface HomeReferenceWordConnection {
  wordKey: string;
  displayWord: string;
  noteCount: number;
  latestRowId: string;
  latestParentNoteId: string;
  latestRecencyMs: number;
}

/** Normalized dictionary headword for grouping saved reference rows. Pure. */
export function referenceWordKey(
  row: Pick<HomeReferenceWordInput, 'sourceSnippet' | 'anchorTextSnapshot' | 'focusTitle'>,
): string | null {
  const raw = (row.sourceSnippet ?? row.anchorTextSnapshot ?? row.focusTitle ?? '').trim();
  if (!raw) return null;
  return raw.toLowerCase();
}

function referenceWordDisplay(
  row: Pick<HomeReferenceWordInput, 'sourceSnippet' | 'anchorTextSnapshot' | 'focusTitle'>,
): string {
  return (row.sourceSnippet ?? row.anchorTextSnapshot ?? row.focusTitle ?? '').trim();
}

/**
 * Dictionary words saved from multiple notes — ranked by reach (distinct notes), then recency.
 * Same word twice in one note counts once. Pure.
 */
export function deriveReferenceWordConnections(
  references: HomeReferenceWordInput[],
  options: { limit: number; minNotes?: number },
): HomeReferenceWordConnection[] {
  const { limit, minNotes = 2 } = options;
  const byWord = new Map<
    string,
    {
      displayWord: string;
      noteIds: Set<string>;
      latestRowId: string;
      latestParentNoteId: string;
      latestRecencyMs: number;
    }
  >();

  for (const row of references) {
    if ((row.entryKind ?? '').trim() !== 'reference') continue;
    const key = referenceWordKey(row);
    if (!key) continue;
    const displayWord = referenceWordDisplay(row);
    if (!displayWord) continue;
    const recencyMs = row.recencyMs ?? 0;
    let bucket = byWord.get(key);
    if (!bucket) {
      bucket = {
        displayWord,
        noteIds: new Set<string>(),
        latestRowId: row.id,
        latestParentNoteId: row.parentNoteId,
        latestRecencyMs: recencyMs,
      };
      byWord.set(key, bucket);
    }
    bucket.noteIds.add(row.parentNoteId);
    if (recencyMs >= bucket.latestRecencyMs) {
      bucket.latestRecencyMs = recencyMs;
      bucket.latestRowId = row.id;
      bucket.latestParentNoteId = row.parentNoteId;
      bucket.displayWord = displayWord;
    }
  }

  return [...byWord.entries()]
    .filter(([, bucket]) => bucket.noteIds.size >= minNotes)
    .map(([wordKey, bucket]) => ({
      wordKey,
      displayWord: bucket.displayWord,
      noteCount: bucket.noteIds.size,
      latestRowId: bucket.latestRowId,
      latestParentNoteId: bucket.latestParentNoteId,
      latestRecencyMs: bucket.latestRecencyMs,
    }))
    .sort(
      (a, b) =>
        b.noteCount - a.noteCount ||
        b.latestRecencyMs - a.latestRecencyMs ||
        a.displayWord.localeCompare(b.displayWord),
    )
    .slice(0, Math.max(0, limit));
}

// 4. Finish a bare highlight ──────────────────────────────────────────────────────

export interface BareHighlightInput {
  id: string;
  entryKind?: string | null;
  miniNoteBody?: string | null;
  notesBody?: string | null;
  /** Touch time (ms) — oldest unannotated surfaces first. */
  recencyMs?: number;
}

/** Only miniNote and scriptureLink rows support the highlight-dock annotation textarea. Pure. */
export function isAnnotatableHighlight(h: BareHighlightInput): boolean {
  const kind = (h.entryKind ?? '').trim();
  return kind === 'miniNote' || kind === 'scriptureLink';
}

export interface HighlightRefMatchInput extends BareHighlightInput {
  scriptureReference?: string | null;
}

/** Case-insensitive scripture ref compare after normalization. */
export function scriptureRefsMatch(a: string, b: string): boolean {
  const ta = (normalizeScriptureReference(a.trim()) ?? a.trim()).toLowerCase();
  const tb = (normalizeScriptureReference(b.trim()) ?? b.trim()).toLowerCase();
  return ta.length > 0 && ta === tb;
}

export function highlightMatchesScriptureRef(row: HighlightRefMatchInput, ref: string): boolean {
  const hr = (row.scriptureReference ?? '').trim();
  if (!hr) return false;
  return scriptureRefsMatch(hr, ref);
}

export function highlightMatchesChapter(row: HighlightRefMatchInput, book: string, chapter: number): boolean {
  const hr = (row.scriptureReference ?? '').trim();
  if (!hr) return false;
  const parsed = parseScriptureReference(normalizeScriptureReference(hr) ?? hr);
  if (!parsed) return false;
  if (parsed.book.localeCompare(book.trim(), undefined, { sensitivity: 'accent' }) !== 0) return false;
  return parsed.chapter === chapter;
}

function pickOldestHighlightByRecency<T extends BareHighlightInput>(matches: T[]): T | undefined {
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => (a.recencyMs ?? 0) - (b.recencyMs ?? 0))[0];
}

/** Any highlight on a verse ref — oldest first. */
export function findHighlightForRef<T extends HighlightRefMatchInput>(highlights: T[], ref: string): T | undefined {
  const matches = highlights.filter((h) => highlightMatchesScriptureRef(h, ref));
  return pickOldestHighlightByRecency(matches);
}

/** Any highlight anywhere in a book chapter — oldest first. */
export function findHighlightForChapter<T extends HighlightRefMatchInput>(
  highlights: T[],
  book: string,
  chapter: number,
): T | undefined {
  const matches = highlights.filter((h) => highlightMatchesChapter(h, book, chapter));
  return pickOldestHighlightByRecency(matches);
}

/** Unannotated highlight on a verse ref — oldest first (same policy as pickBareHighlight). */
export function findUnannotatedHighlightForRef<T extends HighlightRefMatchInput>(
  highlights: T[],
  ref: string,
): T | undefined {
  const matches = highlights.filter(
    (h) => isHighlightUnannotated(h) && isAnnotatableHighlight(h) && highlightMatchesScriptureRef(h, ref),
  );
  return pickOldestHighlightByRecency(matches);
}

/** Unannotated highlight anywhere in a book chapter — oldest first. */
export function findUnannotatedHighlightForChapter<T extends HighlightRefMatchInput>(
  highlights: T[],
  book: string,
  chapter: number,
): T | undefined {
  const matches = highlights.filter(
    (h) => isHighlightUnannotated(h) && isAnnotatableHighlight(h) && highlightMatchesChapter(h, book, chapter),
  );
  return pickOldestHighlightByRecency(matches);
}

/** True when a highlight has no annotation (both annotation fields empty). Pure. */
export function isHighlightUnannotated(h: BareHighlightInput): boolean {
  return !(h.miniNoteBody ?? '').trim() && !(h.notesBody ?? '').trim();
}

/** Oldest-touched highlight that was never annotated — a gentle "add a thought" nudge. Pure. */
export function pickBareHighlight<T extends BareHighlightInput>(highlights: T[]): T | undefined {
  const unannotated = highlights.filter((h) => isHighlightUnannotated(h) && isAnnotatableHighlight(h));
  if (unannotated.length === 0) return undefined;
  return [...unannotated].sort((a, b) => (a.recencyMs ?? 0) - (b.recencyMs ?? 0))[0];
}

/** A note that could be marked, and the fields that decide whether it is worth suggesting. */
export interface MarkNoteInput {
  id: string;
  title?: string | null;
  content?: string | null;
  contentLength?: number | null;
  contentEncrypted?: boolean | null;
  noteType?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}

/**
 * Below this a note has not said enough for "what stuck with you?" to have an answer.
 *
 * Measured on the visible text, never on the stored HTML. A note holding one mention pill is
 * 503 characters of inline style around a single word, and the first version of this picker
 * duly offered it — a card inviting you to mark a note with nothing in it to mark.
 */
export const MARK_NOTE_MIN_CHARS = 280;

/**
 * The note to invite marking, or undefined when none is worth asking about.
 *
 * This is where the five reflective review prompts landed. Review could not grade them, and
 * what they actually want is for you to go back in and mark the part that answers them — so the
 * card opens a note you have written a fair amount in and never marked anything in.
 *
 * `markedNoteIds` is what the caller knows about, not what exists. Highlights load a page at a
 * time, so an old note whose marks are not in memory can be suggested despite having some. That
 * is the failure this picker is willing to have: the cost is a card inviting you into a note you
 * have already marked, which is a wasted suggestion and nothing worse. Preferring the oldest
 * matters more than being certain — the recent notes are the ones whose highlights *are* loaded.
 */
/** How much a reader would actually see: tags dropped, entities decoded, whitespace collapsed. */
function visibleTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

export function pickMarkNoteCandidate<T extends MarkNoteInput>(
  notes: readonly T[],
  markedNoteIds: ReadonlySet<string>,
  excludeIds: ReadonlySet<string> = new Set(),
): T | undefined {
  const eligible = notes.filter((note) => {
    if (markedNoteIds.has(note.id) || excludeIds.has(note.id)) return false;
    // Encrypted bodies cannot be measured, and scripture notes are not the reader's own writing.
    if (note.contentEncrypted) return false;
    if (note.noteType === 'scripture') return false;
    // `contentLength` is the stored HTML's length, which is why it is only a ceiling here: a
    // note too short even before the markup is stripped cannot pass, and everything else has to
    // be measured properly.
    if ((note.contentLength ?? Number.POSITIVE_INFINITY) < MARK_NOTE_MIN_CHARS) return false;
    if (!note.content) return false;
    return visibleTextLength(note.content) >= MARK_NOTE_MIN_CHARS;
  });
  if (!eligible.length) return undefined;

  // Oldest first: a note written this morning does not need to be revisited, and its highlights
  // are the ones most likely to be loaded if it has any.
  return [...eligible].sort((a, b) => {
    const at = Date.parse(a.updatedAt ?? a.createdAt ?? '') || 0;
    const bt = Date.parse(b.updatedAt ?? b.createdAt ?? '') || 0;
    return at - bt;
  })[0];
}

// 5. Reflection prompt (season / theme) ───────────────────────────────────────────

export interface ReflectionPrompt {
  source: 'season' | 'theme';
  /** The draft-note title to seed, e.g. "Advent reflection" or "Prayer on Suffering". */
  title: string;
  /** Short label for the card (season name or theme). */
  label: string;
}

/**
 * A "start a reflection" prompt: the liturgical season if one is active (timely), otherwise a prayer
 * on the theme the user has been sitting in. Returns undefined when neither signal is present. Pure.
 */
export function deriveReflectionPrompt(input: {
  seasonLabel?: string | null;
  arcTheme?: string | null;
}): ReflectionPrompt | undefined {
  const season = (input.seasonLabel ?? '').trim();
  if (season) {
    return { source: 'season', title: `${season} reflection`, label: season };
  }
  const theme = (input.arcTheme ?? '').trim();
  if (theme) {
    return { source: 'theme', title: `Prayer on ${theme}`, label: theme };
  }
  return undefined;
}
