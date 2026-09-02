/**
 * The database half of Review: turning stored rows into questions, and answers back into rows.
 *
 * The route file above this is HTTP plumbing; everything that needs to know what a review item
 * *means* lives here, so the same logic serves the inbox, the session, and (later) native
 * calling the same endpoints. The scheduling arithmetic and the prompt wording are one layer
 * further out again, in `src/utils/review-scheduling.ts` and `src/utils/review-prompts.ts`,
 * because neither needs a database and both need to be exercised by tests that do not have one.
 */

import {
  db,
  and,
  desc,
  eq,
  inArray,
  lte,
  or,
  Notes,
  NoteConnections,
  NoteFingerprints,
  ReviewEvents,
  ReviewItems,
  StudyThreadEntries,
  first,
} from '../db';
import { generateTimestampId } from '@/utils/ids';
import {
  type ReviewEventAction,
  type ReviewItemKind,
  type ReviewItemOrigin,
  type ReviewItemStatus,
  type ReviewOutcome,
  type RecallState,
} from '@/utils/review-item-kinds';
import {
  deferReview,
  firstDueAt,
  nextReviewAfter,
} from '@/utils/review-scheduling';
import { reviewPromptFor, VERSE_LADDER_MAX_STEP, VERSE_REBUILD_STEP } from '@/utils/review-prompts';
import { buildVerseCloze, verseCue, type VerseCloze } from '@/utils/verse-cloze';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { collectStudyThreadGraph } from './study-thread-graph';
import { fetchStudyThreadNoteRows } from './study-thread-note-rows';
import { pickRepNoteIdForCluster } from './study-thread-cluster-count';
import { fetchVerseText } from './fetch-verse-text';
import { recordNoteRecallEngaged } from './note-recall-state';
import { countableUserNotesWhere } from './purge-onboarding-content';
import {
  noteTouch,
  touchNodes,
  verseTouches,
  type NodeTouch,
} from './study-bible-layer';
import { nodeKey, verseNodesForReference } from '@/utils/study-bible-nodes';
import { REVIEWED_SOURCE } from '@/utils/study-bible-source-copy';

export interface ReviewItemRow {
  id: string;
  userId: string;
  kind: string;
  sourceKey: string;
  noteId: string | null;
  secondaryNoteId: string | null;
  studyThreadEntryId: string | null;
  scriptureReference: string | null;
  translation: string | null;
  status: string;
  recallState: string;
  intervalDays: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  lastOutcome: string | null;
  successStreak: number;
  reviewCount: number;
  ladderStep: number;
  origin: string;
  challengeId: string | null;
  sourceLabel: string | null;
  sourceAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

/** What a surface needs to render one item without fetching the note behind it. */
export interface ReviewItemView {
  id: string;
  kind: ReviewItemKind;
  prompt: string;
  promptKey: string;
  recallState: RecallState;
  status: ReviewItemStatus;
  origin: ReviewItemOrigin;
  dueAt: string;
  reviewCount: number;
  ladderStep: number;
  /** Titles for the row's meta line; never the note body, which is the point of the reveal. */
  noteTitle: string | null;
  secondaryNoteTitle: string | null;
  scriptureReference: string | null;
  noteId: string | null;
  challengeId: string | null;
  /** Why this row is here, in the reader's words. Null on items they added themselves. */
  sourceLabel: string | null;
  sourceAt: string | null;
}

function displayTitle(title: string | null | undefined): string | null {
  const cleaned = stripServerAutoUntitledNoteTitleForDisplay((title ?? '').trim());
  return cleaned || null;
}

/**
 * Titles for a batch of items in one query rather than per row.
 *
 * The inbox renders at most three, but the session and the manage list do not, and a
 * per-item lookup there is a straightforward N+1 on the page a subscriber uses most.
 */
async function loadTitles(userId: string, noteIds: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(noteIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: Notes.id, title: Notes.title })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), inArray(Notes.id, unique)));
  return new Map(rows.map((r) => [r.id, displayTitle(r.title)]));
}

/**
 * Thread items name the cluster, not the representative note.
 *
 * "What is taking shape across your `Adoption, not slavery` Thread" is wrong in a way a
 * reader notices immediately — that is one note inside the Thread, and the rep is an
 * implementation detail of how the graph picks a label.
 */
async function threadTitleFor(userId: string, repNoteId: string): Promise<string | null> {
  const rep = first(
    await db
      .select({ studyThreadTitle: Notes.studyThreadTitle, title: Notes.title })
      .from(Notes)
      .where(and(eq(Notes.id, repNoteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  if (!rep) return null;
  return displayTitle(rep.studyThreadTitle) ?? displayTitle(rep.title);
}

export async function buildReviewItemViews(
  userId: string,
  rows: ReviewItemRow[],
): Promise<ReviewItemView[]> {
  const titles = await loadTitles(
    userId,
    rows.flatMap((r) => [r.noteId, r.secondaryNoteId].filter((id): id is string => Boolean(id))),
  );

  const views: ReviewItemView[] = [];
  for (const row of rows) {
    const kind = row.kind as ReviewItemKind;
    const noteTitle = row.noteId ? titles.get(row.noteId) ?? null : null;
    const secondaryNoteTitle = row.secondaryNoteId ? titles.get(row.secondaryNoteId) ?? null : null;
    const threadTitle =
      kind === 'thread' && row.noteId ? await threadTitleFor(userId, row.noteId) : null;

    // The recognize rung shows a fragment of the verse, so it needs the text. Every other
    // prompt is built from titles and references alone.
    let cue: string | null = null;
    if (kind === 'verse' && row.ladderStep === 0 && row.scriptureReference) {
      const text = await fetchVerseText(row.scriptureReference, row.translation ?? 'NET');
      cue = text ? verseCue(stripHtml(text)) : null;
    }

    const { key, prompt } = reviewPromptFor(
      { kind, reviewCount: row.reviewCount, ladderStep: row.ladderStep },
      {
        reference: row.scriptureReference,
        noteTitle,
        secondaryNoteTitle,
        threadTitle,
        cue,
      },
    );

    views.push({
      id: row.id,
      kind,
      prompt,
      promptKey: key,
      recallState: row.recallState as RecallState,
      status: row.status as ReviewItemStatus,
      origin: row.origin as ReviewItemOrigin,
      dueAt: row.dueAt.toISOString(),
      reviewCount: row.reviewCount,
      ladderStep: row.ladderStep,
      noteTitle: threadTitle ?? noteTitle,
      secondaryNoteTitle,
      scriptureReference: row.scriptureReference,
      noteId: row.noteId,
      challengeId: row.challengeId,
      sourceLabel: row.sourceLabel,
      sourceAt: row.sourceAt?.toISOString() ?? null,
    });
  }
  return views;
}

/** Verse text arrives as formatted HTML with superscript verse numbers. */
export function stripHtml(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gs, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function listDueReviewItems(
  userId: string,
  limit: number,
  now: Date = new Date(),
): Promise<ReviewItemRow[]> {
  return (await db
    .select()
    .from(ReviewItems)
    .where(
      and(
        eq(ReviewItems.userId, userId),
        eq(ReviewItems.status, 'active'),
        lte(ReviewItems.dueAt, now),
      ),
    )
    .orderBy(ReviewItems.dueAt)
    .limit(limit)) as ReviewItemRow[];
}

export async function listReviewItems(
  userId: string,
  status?: ReviewItemStatus,
): Promise<ReviewItemRow[]> {
  const where = status
    ? and(eq(ReviewItems.userId, userId), eq(ReviewItems.status, status))
    : eq(ReviewItems.userId, userId);
  return (await db
    .select()
    .from(ReviewItems)
    .where(where)
    .orderBy(ReviewItems.dueAt)
    .limit(200)) as ReviewItemRow[];
}

export async function getReviewItem(userId: string, id: string): Promise<ReviewItemRow | null> {
  const row = first(
    await db
      .select()
      .from(ReviewItems)
      .where(and(eq(ReviewItems.id, id), eq(ReviewItems.userId, userId)))
      .limit(1),
  );
  return (row as ReviewItemRow | undefined) ?? null;
}

export interface CreateReviewItemInput {
  kind: ReviewItemKind;
  noteId?: string | null;
  secondaryNoteId?: string | null;
  studyThreadEntryId?: string | null;
  scriptureReference?: string | null;
  translation?: string | null;
  origin?: ReviewItemOrigin;
  challengeId?: string | null;
  /** Engine only: why this is here, in the reader's words. See study-bible-source-copy.ts. */
  sourceLabel?: string | null;
  sourceAt?: Date | null;
}

export function reviewSourceKey(input: {
  kind: ReviewItemKind;
  noteId?: string | null;
  secondaryNoteId?: string | null;
  studyThreadEntryId?: string | null;
  scriptureReference?: string | null;
}): string | null {
  switch (input.kind) {
    case 'note':
    case 'thread':
      return input.noteId ? `${input.kind}:${input.noteId}` : null;
    case 'highlight':
      return input.studyThreadEntryId ? `highlight:${input.studyThreadEntryId}` : null;
    case 'verse':
      return input.scriptureReference
        ? `verse:${input.scriptureReference.trim().toLowerCase()}`
        : null;
    case 'connection': {
      if (!input.noteId || !input.secondaryNoteId) return null;
      // Sorted, so a link added from either end is one review item.
      const [a, b] = [input.noteId, input.secondaryNoteId].sort();
      return `connection:${a}:${b}`;
    }
  }
}

async function ownsNote(userId: string, noteId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  return Boolean(row);
}

export interface CreateReviewItemResult {
  item: ReviewItemRow;
  created: boolean;
}

/**
 * Add something to Review, or hand back what is already there.
 *
 * Idempotent by `sourceKey`, and the existing row is returned rather than an error: the
 * reader tapping "Add to Review" on a note they already added meant "make sure this is in
 * Review", and it now is. A 409 would be technically accurate and useless.
 */
export async function createReviewItem(
  userId: string,
  input: CreateReviewItemInput,
  now: Date = new Date(),
): Promise<CreateReviewItemResult | { error: string }> {
  let noteId = input.noteId?.trim() || null;
  const secondaryNoteId = input.secondaryNoteId?.trim() || null;

  // A Thread is addressed by any of its notes; the graph decides which one labels it.
  if (input.kind === 'thread' && noteId) {
    noteId = (await pickRepNoteIdForCluster(userId, noteId)) ?? noteId;
  }

  if (noteId && !(await ownsNote(userId, noteId))) return { error: 'Note not found' };
  if (secondaryNoteId && !(await ownsNote(userId, secondaryNoteId))) {
    return { error: 'Note not found' };
  }

  if (input.kind === 'connection') {
    if (!noteId || !secondaryNoteId) return { error: 'A connection needs two notes' };
    const edge = first(
      await db
        .select({ id: NoteConnections.id })
        .from(NoteConnections)
        .where(
          and(
            eq(NoteConnections.userId, userId),
            or(
              and(
                eq(NoteConnections.fromNoteId, noteId),
                eq(NoteConnections.toNoteId, secondaryNoteId),
              ),
              and(
                eq(NoteConnections.fromNoteId, secondaryNoteId),
                eq(NoteConnections.toNoteId, noteId),
              ),
            ),
          ),
        )
        .limit(1),
    );
    if (!edge) return { error: 'These notes are not connected' };
  }

  // A verse item made from a highlight inherits that highlight's reference and translation:
  // without it the row has no subject at all, since `verse` is keyed by reference.
  let scriptureReference = input.scriptureReference?.trim() || null;
  let translation = input.translation?.trim() || null;

  if ((input.kind === 'highlight' || input.kind === 'verse') && input.studyThreadEntryId) {
    const entry = first(
      await db
        .select({
          id: StudyThreadEntries.id,
          reference: StudyThreadEntries.scriptureReference,
          translation: StudyThreadEntries.scripturePassageTranslation,
        })
        .from(StudyThreadEntries)
        .where(
          and(
            eq(StudyThreadEntries.id, input.studyThreadEntryId),
            eq(StudyThreadEntries.userId, userId),
          ),
        )
        .limit(1),
    );
    if (!entry) return { error: 'Highlight not found' };
    scriptureReference = scriptureReference ?? entry.reference ?? null;
    translation = translation ?? entry.translation ?? null;
  }

  const sourceKey = reviewSourceKey({ ...input, noteId, secondaryNoteId, scriptureReference });
  if (!sourceKey) return { error: 'Not enough to review' };

  const existing = first(
    await db
      .select()
      .from(ReviewItems)
      .where(and(eq(ReviewItems.userId, userId), eq(ReviewItems.sourceKey, sourceKey)))
      .limit(1),
  ) as ReviewItemRow | undefined;

  if (existing) {
    // Adding something that was paused or archived is how the reader brings it back.
    if (existing.status !== 'active') {
      const revived = first(
        await db
          .update(ReviewItems)
          .set({ status: 'active', dueAt: firstDueAt(now), updatedAt: now })
          .where(eq(ReviewItems.id, existing.id))
          .returning(),
      ) as ReviewItemRow;
      return { item: revived, created: false };
    }
    return { item: existing, created: false };
  }

  const inserted = first(
    await db
      .insert(ReviewItems)
      .values({
        id: generateTimestampId('review'),
        userId,
        kind: input.kind,
        sourceKey,
        noteId,
        secondaryNoteId,
        studyThreadEntryId: input.studyThreadEntryId?.trim() || null,
        scriptureReference,
        translation,
        status: 'active',
        recallState: 'new',
        intervalDays: 1,
        dueAt: firstDueAt(now, input.origin ?? 'user'),
        successStreak: 0,
        reviewCount: 0,
        ladderStep: 0,
        origin: input.origin ?? 'user',
        challengeId: input.challengeId ?? null,
        sourceLabel: input.sourceLabel?.trim() || null,
        sourceAt: input.sourceAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning(),
  ) as ReviewItemRow | undefined;

  if (!inserted) {
    // Lost a race against another device adding the same thing.
    const raced = first(
      await db
        .select()
        .from(ReviewItems)
        .where(and(eq(ReviewItems.userId, userId), eq(ReviewItems.sourceKey, sourceKey)))
        .limit(1),
    ) as ReviewItemRow | undefined;
    if (!raced) return { error: 'Could not add to Review' };
    return { item: raced, created: false };
  }

  return { item: inserted, created: true };
}

export async function recordReviewEvent(
  userId: string,
  item: ReviewItemRow,
  action: ReviewEventAction,
  extra: { attempt?: string | null; previousIntervalDays?: number; nextIntervalDays?: number } = {},
  now: Date = new Date(),
): Promise<void> {
  await db.insert(ReviewEvents).values({
    id: generateTimestampId('revev'),
    userId,
    reviewItemId: item.id,
    noteId: item.noteId,
    action,
    attempt: extra.attempt?.trim() || null,
    previousIntervalDays: extra.previousIntervalDays ?? null,
    nextIntervalDays: extra.nextIntervalDays ?? null,
    createdAt: now,
  });
}

export interface ReviewOutcomeResult {
  item: ReviewItemRow;
  nextReturnDays: number;
}

/**
 * Answer an item: reschedule it, log the answer, and feed the passive layer.
 *
 * The `recordNoteRecallEngaged` call is the one place these two systems touch. Review's own
 * schedule lives on this row; that call lengthens the *resurfacing* stability on
 * NoteFingerprints, so a note the reader is actively reviewing stops being offered as a
 * "worth another look" card on Home. Without it the two surfaces would compete over the same
 * note — one because it is due, the other because it looks neglected.
 */
export async function applyReviewOutcome(
  userId: string,
  item: ReviewItemRow,
  outcome: ReviewOutcome,
  attempt: string | null,
  now: Date = new Date(),
): Promise<ReviewOutcomeResult> {
  const next = nextReviewAfter(
    outcome,
    {
      intervalDays: item.intervalDays,
      successStreak: item.successStreak,
      reviewCount: item.reviewCount,
      lastOutcome: (item.lastOutcome as ReviewOutcome | null) ?? null,
    },
    now,
  );

  // The ladder only advances on a clean recall — half-remembering a verse is not a reason to
  // be asked a harder question about it next time.
  const ladderStep =
    item.kind === 'verse' && outcome === 'recalled'
      ? Math.min(VERSE_LADDER_MAX_STEP, item.ladderStep + 1)
      : item.ladderStep;

  const updated = first(
    await db
      .update(ReviewItems)
      .set({
        intervalDays: next.intervalDays,
        dueAt: next.dueAt,
        successStreak: next.successStreak,
        reviewCount: next.reviewCount,
        recallState: next.recallState,
        lastOutcome: outcome,
        lastReviewedAt: now,
        ladderStep,
        updatedAt: now,
      })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;

  await recordReviewEvent(userId, item, outcome, {
    attempt,
    previousIntervalDays: item.intervalDays,
    nextIntervalDays: next.intervalDays,
  }, now);

  if (outcome === 'recalled') {
    for (const id of [item.noteId, item.secondaryNoteId]) {
      if (id) await recordNoteRecallEngaged(userId, id);
    }
  }

  // Study Bible layer: what the reader just answered, and when it comes back. The mirror
  // columns exist so the engine can skip a node that is already scheduled without joining
  // this table; ReviewItems above stays the authority on the schedule itself.
  void recordReviewOutcomeNodes(userId, item, outcome, attempt, next, now);

  return { item: updated, nextReturnDays: next.intervalDays };
}

/**
 * The node(s) an answered item is about.
 *
 * Kind by kind, because a review item and a node are addressed differently: a `verse` item
 * carries a display reference that has to be expanded back into verses, a `highlight` item
 * may or may not have one, and a `connection` is two notes plus the link between them.
 */
async function recordReviewOutcomeNodes(
  userId: string,
  item: ReviewItemRow,
  outcome: ReviewOutcome,
  attempt: string | null,
  next: { dueAt: Date; recallState: RecallState },
  now: Date,
): Promise<void> {
  const mirror = { lastReviewedAt: now, nextReviewAt: next.dueAt, recallState: next.recallState };
  const touches: NodeTouch[] = [];

  if (item.scriptureReference) {
    const { verses, chapters } = verseNodesForReference(item.scriptureReference);
    for (const touch of verseTouches({
      verses,
      chapters,
      signal: 'review',
      at: now,
      sourceLabel: REVIEWED_SOURCE,
      translation: item.translation,
    })) {
      // Only the verses carry the mirror; the chapter above them is not what was asked about.
      touches.push(touch.kind === 'verse' ? { ...touch, reviewMirror: mirror } : touch);
    }
  }

  if ((item.kind === 'note' || item.kind === 'highlight') && item.noteId) {
    touches.push({
      ...noteTouch({ noteId: item.noteId, signal: 'review', at: now, sourceLabel: REVIEWED_SOURCE }),
      reviewMirror: mirror,
    });
  }

  if (item.kind === 'connection' && item.noteId && item.secondaryNoteId) {
    const [a, b] = [item.noteId, item.secondaryNoteId].sort();
    touches.push({
      key: nodeKey.connection(item.noteId, item.secondaryNoteId),
      kind: 'connection',
      signal: 'review',
      at: now,
      noteId: a,
      secondaryNoteId: b,
      sourceLabel: REVIEWED_SOURCE,
      reviewMirror: mirror,
    });
  }

  if (item.kind === 'thread' && item.noteId) {
    touches.push({
      key: nodeKey.thread(item.noteId),
      kind: 'thread',
      signal: 'review',
      at: now,
      noteId: item.noteId,
      sourceLabel: REVIEWED_SOURCE,
      reviewMirror: mirror,
    });
    // Answering "what is this cluster forming?" in your own words is synthesis — the only
    // one the app can observe deterministically outside of naming a Thread.
    if (attempt?.trim() && outcome !== 'revealed') {
      touches.push({
        key: nodeKey.thread(item.noteId),
        kind: 'thread',
        signal: 'synthesis',
        at: now,
        noteId: item.noteId,
      });
    }
  }

  await touchNodes(userId, touches);
}

export async function deferReviewItem(
  userId: string,
  item: ReviewItemRow,
  now: Date = new Date(),
): Promise<ReviewItemRow> {
  const { dueAt } = deferReview({ dueAt: item.dueAt }, now);
  const updated = first(
    await db
      .update(ReviewItems)
      .set({ dueAt, updatedAt: now })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;
  await recordReviewEvent(userId, item, 'deferred', {}, now);
  return updated;
}

export async function setReviewItemStatus(
  userId: string,
  item: ReviewItemRow,
  status: ReviewItemStatus,
  now: Date = new Date(),
): Promise<ReviewItemRow> {
  // Coming back from a pause starts the clock again rather than arriving already overdue.
  const dueAt = status === 'active' && item.status !== 'active' ? firstDueAt(now) : item.dueAt;
  const updated = first(
    await db
      .update(ReviewItems)
      .set({ status, dueAt, updatedAt: now })
      .where(and(eq(ReviewItems.id, item.id), eq(ReviewItems.userId, userId)))
      .returning(),
  ) as ReviewItemRow;

  const action: ReviewEventAction =
    status === 'active' ? 'resumed' : status === 'paused' ? 'paused' : 'archived';
  await recordReviewEvent(userId, item, action, {}, now);
  return updated;
}

export interface ReviewRevealPayload {
  note?: { id: string; title: string | null; content: string } | null;
  secondaryNote?: { id: string; title: string | null; content: string } | null;
  verseText?: string | null;
  cloze?: VerseCloze | null;
  thread?: { title: string | null; members: { id: string; title: string | null }[] } | null;
}

/** What the reader sees after they answer, or after they give up and open it. */
export async function buildReviewReveal(
  userId: string,
  item: ReviewItemRow,
): Promise<ReviewRevealPayload> {
  const payload: ReviewRevealPayload = {};

  if (item.kind === 'verse' || item.kind === 'highlight') {
    if (item.scriptureReference) {
      const html = await fetchVerseText(item.scriptureReference, item.translation ?? 'NET');
      payload.verseText = html || null;
      if (item.kind === 'verse' && item.ladderStep === VERSE_REBUILD_STEP && html) {
        payload.cloze = buildVerseCloze(stripHtml(html), `${item.id}:${item.ladderStep}`);
      }
    }
  }

  const noteIds = [item.noteId, item.secondaryNoteId].filter((id): id is string => Boolean(id));
  if (noteIds.length > 0 && item.kind !== 'thread') {
    const rows = await db
      .select({ id: Notes.id, title: Notes.title, content: Notes.content })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), inArray(Notes.id, noteIds)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const primary = item.noteId ? byId.get(item.noteId) : undefined;
    const secondary = item.secondaryNoteId ? byId.get(item.secondaryNoteId) : undefined;
    payload.note = primary
      ? { id: primary.id, title: displayTitle(primary.title), content: primary.content }
      : null;
    payload.secondaryNote = secondary
      ? { id: secondary.id, title: displayTitle(secondary.title), content: secondary.content }
      : null;
  }

  if (item.kind === 'thread' && item.noteId) {
    const graph = await collectStudyThreadGraph(item.noteId, userId);
    const rows = await fetchStudyThreadNoteRows(graph.nodeIds, userId);
    payload.thread = {
      title: await threadTitleFor(userId, item.noteId),
      members: rows.map((r) => ({ id: r.id, title: displayTitle(r.title) })),
    };
  }

  return payload;
}

/**
 * A highlight was deleted: retire what was anchored to it.
 *
 * Archived rather than deleted, matching how a challenge is retired rather than removed. The
 * reader's answers to this item are in ReviewEvents and are worth keeping — the item is what
 * has no subject any more, not the history of having worked at it.
 *
 * Non-throwing on a missing table: this runs after a deletion that already committed.
 */
export async function retireReviewForStudyThreadEntry(
  userId: string,
  studyThreadEntryId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(ReviewItems)
    .set({ status: 'archived', updatedAt: now })
    .where(
      and(
        eq(ReviewItems.userId, userId),
        eq(ReviewItems.studyThreadEntryId, studyThreadEntryId),
        inArray(ReviewItems.status, ['active', 'paused']),
      ),
    );
}
