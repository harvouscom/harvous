/**
 * Publishing a series as a study plan the congregation walks.
 *
 * The planner already holds a dated sequence of weeks; a sequence Thread already
 * holds an authored order and the step a room is on. This is the join: each week
 * of a series becomes a step note in one Thread, in the space that planned it.
 *
 * Three decisions worth stating, because each one had a cheaper wrong answer:
 *
 *   - **A series is still not a Thread.** `ChurchSeries.publishedThreadId`
 *     points at the artifact of publishing; the series stays the plan entity.
 *     The schema docblock explains why the series itself must not become one.
 *   - **Published steps claim their week through `ChurchServicePublishedNotes`,
 *     not `Notes.startedFromServiceId`.** That column is the congregant's own
 *     note, read only ever scoped to one user. A published step is church
 *     material addressed to a room — the same lineage shape, a different fact.
 *     `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` decided this inversion.
 *   - **Republishing appends.** A pastor who adds week nine gets week nine, not
 *     a second study plan, and never a duplicate of weeks one through eight.
 */

import {
  db,
  first,
  ChurchSeries,
  ChurchServicePublishedNotes,
  ChurchServices,
  NoteThreads,
  Notes,
  SpaceNotes,
  Spaces,
  Threads,
  and,
  asc,
  eq,
  inArray,
  isNull,
} from '../db';
import { serializeSequenceNoteIds } from './thread-sequence';

export type PublishSeriesResult = {
  threadId: string;
  /** Steps appended by this call. Zero on a no-op republish. */
  created: number;
  /** Weeks that already had a step in this Thread. */
  skipped: number;
  /** Whether this call made the Thread the space's current one. */
  pinned: boolean;
};

/**
 * Weeks of a series, in the order a congregation would walk them.
 *
 * Dated weeks first in date order, then undated backlog ideas by creation —
 * an undated row is an idea the pastor has not placed yet, so it belongs at
 * the end of the plan rather than sorting as a blank at the front.
 */
export async function seriesWeeksInPlanOrder(seriesId: string) {
  return db
    .select({
      id: ChurchServices.id,
      title: ChurchServices.title,
      reference: ChurchServices.reference,
      serviceDate: ChurchServices.serviceDate,
      starterTemplateId: ChurchServices.starterTemplateId,
    })
    .from(ChurchServices)
    .where(eq(ChurchServices.seriesId, seriesId))
    .orderBy(asc(ChurchServices.serviceDate), asc(ChurchServices.createdAt));
}

/**
 * The body a step note starts life with.
 *
 * Deliberately thin: a passage line when the week has one, and nothing else.
 * The step is a place for the room to write, not a document the plan fills in
 * on their behalf — and a starter template, when the week names one, is applied
 * by the same path congregants already get rather than being inlined here.
 */
export function stepNoteSeedContent(week: { reference: string | null }): string {
  const reference = week.reference?.trim();
  return reference ? `<p>${escapeHtml(reference)}</p>` : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Whether this Thread is the artifact of publishing a series.
 *
 * The one narrow crack in `SHARED_THREAD_NOT_PUBLIC`. A space Thread normally
 * cannot carry a public link because its steps are notes members wrote, and a
 * public URL would expose their titles without their consent. A published plan
 * is the opposite: every step is church-authored staff material, written to be
 * handed to a room. That distinction is this function, and it is the only thing
 * standing between the two — so it asks the database, never a request body.
 */
export async function isPublishedSeriesThread(threadId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: ChurchSeries.id })
      .from(ChurchSeries)
      .where(eq(ChurchSeries.publishedThreadId, threadId))
      .limit(1),
  );
  return Boolean(row);
}

/** Which of these weeks already have a published step inside this Thread. */
export async function publishedWeekIdsInThread(
  serviceIds: string[],
  threadId: string,
): Promise<Set<string>> {
  if (serviceIds.length === 0) return new Set();
  const rows = await db
    .select({ serviceId: ChurchServicePublishedNotes.serviceId })
    .from(ChurchServicePublishedNotes)
    .innerJoin(NoteThreads, eq(NoteThreads.noteId, ChurchServicePublishedNotes.noteId))
    .where(
      and(
        inArray(ChurchServicePublishedNotes.serviceId, serviceIds),
        eq(NoteThreads.threadId, threadId),
      ),
    );
  return new Set(rows.map((row) => row.serviceId));
}

/**
 * The author's own "My Home", which is where every note in this codebase
 * actually lives.
 *
 * `Notes.spaceId` is the note's home, and `SpaceNotes` is its association with
 * a room — a note composed into a Shared Space has `spaceId` pointing at the
 * author's personal space and a `SpaceNotes` row pointing at the room. Setting
 * `Notes.spaceId` to the shared space instead would make published steps the
 * only notes in the system shaped differently from every other one.
 *
 * Returns null when the author somehow has no personal space; the caller then
 * leaves `spaceId` unset rather than inventing one.
 */
async function homeSpaceIdFor(userId: string): Promise<string | null> {
  const personal = await db
    .select({ id: Spaces.id, title: Spaces.title })
    .from(Spaces)
    .where(and(eq(Spaces.userId, userId), eq(Spaces.type, 'personal')));
  return (
    personal.find((row) => row.title.trim().toLowerCase() === 'my home')?.id ??
    personal[0]?.id ??
    null
  );
}

/**
 * Next `simpleNoteId` for an author, the way the note routes derive it.
 * Steps are real notes and must not arrive without the id every list renders.
 */
async function nextSimpleNoteIdFor(userId: string): Promise<number> {
  const rows = await db
    .select({ simpleNoteId: Notes.simpleNoteId })
    .from(Notes)
    .where(eq(Notes.userId, userId));
  const highest = rows.reduce((max, row) => Math.max(max, row.simpleNoteId ?? 0), 0);
  return highest + 1;
}

/**
 * Publish (or re-publish) a series into its space as a sequence Thread.
 *
 * Callers must have already proven the actor may both manage this plan and
 * author this space's Thread structure — this function does no gating.
 */
export async function publishSeriesAsStudyPlan(input: {
  series: { id: string; title: string; color: string | null; publishedThreadId: string | null };
  spaceId: string;
  actorId: string;
}): Promise<PublishSeriesResult> {
  const { series, spaceId, actorId } = input;
  const now = new Date();

  const weeks = await seriesWeeksInPlanOrder(series.id);

  let threadId = series.publishedThreadId;
  let pinned = false;

  if (!threadId) {
    threadId = `thread_${Date.now()}`;
    /*
      Pin only into a vacancy. `Threads_onePinnedPerSpace` means an
      unconditional pin would quietly demote whatever the room was already
      gathered around — publishing a plan is not grounds for taking the
      congregation off the thing they are mid-way through.
    */
    const existingPinned = first(
      await db
        .select({ id: Threads.id })
        .from(Threads)
        .where(and(eq(Threads.spaceId, spaceId), eq(Threads.isPinned, true)))
        .limit(1),
    );
    pinned = !existingPinned;

    await db.insert(Threads).values({
      id: threadId,
      title: series.title,
      subtitle: null,
      spaceId,
      userId: actorId,
      color: series.color,
      isPinned: pinned,
      isPublic: false,
      order: 0,
      mode: 'sequence',
      sequenceNoteIds: serializeSequenceNoteIds([]),
      sequenceCurrentNoteId: null,
      createdAt: now,
      updatedAt: now,
      lastVisited: now,
    });
  }

  const alreadyPublished = await publishedWeekIdsInThread(
    weeks.map((week) => week.id),
    threadId,
  );

  // The order this Thread already holds, filtered to steps still attached.
  const existingSteps = await db
    .select({ noteId: NoteThreads.noteId })
    .from(NoteThreads)
    .innerJoin(SpaceNotes, and(eq(SpaceNotes.noteId, NoteThreads.noteId), eq(SpaceNotes.spaceId, spaceId)))
    .where(and(eq(NoteThreads.threadId, threadId), isNull(SpaceNotes.removedAt)));
  const orderedNoteIds = existingSteps.map((row) => row.noteId);

  let simpleNoteId = await nextSimpleNoteIdFor(actorId);
  const noteHomeSpaceId = await homeSpaceIdFor(actorId);
  let created = 0;

  for (const week of weeks) {
    if (alreadyPublished.has(week.id)) continue;

    const noteId = `note_${Date.now()}_${created}`;
    await db.insert(Notes).values({
      id: noteId,
      title: week.title,
      content: stepNoteSeedContent(week),
      // The step's canonical Thread is the plan it belongs to.
      threadId,
      /* The author's home, not the room — the room is the SpaceNotes row
         below. See homeSpaceIdFor. */
      spaceId: noteHomeSpaceId ?? spaceId,
      simpleNoteId: simpleNoteId++,
      noteType: 'default',
      userId: actorId,
      isPublic: false,
      contentEncrypted: false,
      startedFromTemplateId: week.starterTemplateId ?? null,
      createdAt: now,
      updatedAt: now,
      lastVisited: now,
    });

    await db.insert(SpaceNotes).values({
      id: `sn_${crypto.randomUUID()}`,
      spaceId,
      noteId,
      addedBy: actorId,
      addedAt: now,
    });
    await db.insert(NoteThreads).values({
      id: `nt_${crypto.randomUUID()}`,
      noteId,
      threadId,
      createdAt: now,
    });
    await db.insert(ChurchServicePublishedNotes).values({
      id: `svcpub_${crypto.randomUUID()}`,
      serviceId: week.id,
      noteId,
      publishedByUserId: actorId,
      createdAt: now,
    });

    orderedNoteIds.push(noteId);
    created += 1;
  }

  const currentThread = first(
    await db
      .select({ sequenceCurrentNoteId: Threads.sequenceCurrentNoteId })
      .from(Threads)
      .where(eq(Threads.id, threadId))
      .limit(1),
  );
  const currentNoteId =
    currentThread?.sequenceCurrentNoteId && orderedNoteIds.includes(currentThread.sequenceCurrentNoteId)
      ? currentThread.sequenceCurrentNoteId
      : orderedNoteIds[0] ?? null;

  await db
    .update(Threads)
    .set({
      mode: 'sequence',
      sequenceNoteIds: serializeSequenceNoteIds(orderedNoteIds),
      sequenceCurrentNoteId: currentNoteId,
      updatedAt: now,
    })
    .where(eq(Threads.id, threadId));

  if (series.publishedThreadId !== threadId) {
    await db
      .update(ChurchSeries)
      .set({ publishedThreadId: threadId, updatedAt: now })
      .where(eq(ChurchSeries.id, series.id));
  }

  return { threadId, created, skipped: alreadyPublished.size, pinned };
}
