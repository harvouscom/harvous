/**
 * Publish a study plan from your own study into a church channel.
 *
 * The reverse of the curriculum handoff in `study-plan-copy.ts`. A staffer adds a plan to My
 * Home (from Discover, a shared link, or one they wrote) and wants their congregation to walk
 * it. Publishing makes an independent copy in the channel: a sequence Thread whose steps are
 * the staffer's own new notes, live in the channel through `SpaceNotes` rows. The Home plan
 * stays theirs and untouched, the same "every copy is independent" rule as everywhere else.
 *
 * Decisions worth naming:
 *
 *   - **A copy, not a move.** Moving the Home Thread would take the staffer's own progress and
 *     notes with it, and a plan from Discover would stop being theirs to walk.
 *   - **One publish per plan per person.** The copy carries `copiedFromThreadId` = the Home
 *     plan, so `Threads_copiedFromThread_unique` makes a second tap a no-op that points at the
 *     first channel copy. The source is a personal Thread, so `resolveSourcePlan` never treats
 *     it as a church plan and no "your church updated this plan" prompt appears.
 *   - **Approval is honoured.** With `Churches.contentApproval` on, someone without
 *     `review_content` is refused with `CONTENT_APPROVAL_REQUIRED`, like `add-note`.
 *   - **Every step lands at once.** Members walk the plan at their own pace (Derek, Nov 26 2026).
 */
import { db, first, Notes, Threads, UserMetadata, and, eq, inArray } from '../db';
import { nowISO } from '../db/dates';
import { generateThreadId } from '@/utils/ids';
import { ensurePersonalHomeSpace } from './ensure-personal-home-space';
import { getEffectiveHighestSimpleNoteId } from './highest-simple-note-id';
import { isUniqueViolationError } from './db-errors';
import { parseSequenceNoteIds, serializeSequenceNoteIds } from './thread-sequence';
import {
  buildCopiedStepRows,
  ensureUserMetadata,
  insertCopiedStepsInTx,
  orderedCopySteps,
  postProcessCopiedSteps,
} from './study-plan-copy';

export type PlanPublishDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404 | 409; code: string; error: string };

/**
 * Whether this publish may happen. Pure; the route supplies what it looked up.
 *
 * The source must be the caller's own study plan in their own study (no space, or their
 * personal Home). The target must be a live church channel the caller leads.
 */
export function decidePlanPublishToChannel(input: {
  actorId: string;
  thread: { userId: string; mode: string; spaceId: string | null } | null;
  sourceSpaceType: string | null;
  channel: { type: string | null; orgId: string | null; deletedAt: unknown } | null;
  callerLeadsChannel: boolean;
  approvalRequired: boolean;
}): PlanPublishDecision {
  const { thread, channel } = input;
  if (!thread || thread.userId !== input.actorId) {
    return { ok: false, status: 404, code: 'STUDY_PLAN_NOT_FOUND', error: 'That study plan is no longer available' };
  }
  if (thread.mode !== 'sequence') {
    return { ok: false, status: 400, code: 'NOT_A_STUDY_PLAN', error: 'Only a study plan can be published this way' };
  }
  if (thread.spaceId && input.sourceSpaceType !== 'personal') {
    return {
      ok: false,
      status: 400,
      code: 'NOT_IN_YOUR_STUDY',
      error: 'Only a study plan in your own study can be published to a channel',
    };
  }
  if (!channel || channel.deletedAt || channel.type !== 'public' || !channel.orgId) {
    return { ok: false, status: 404, code: 'CHANNEL_NOT_FOUND', error: 'Channel not found' };
  }
  // Same 404 for a channel they don't lead: never "exists, but not yours".
  if (!input.callerLeadsChannel) {
    return { ok: false, status: 404, code: 'CHANNEL_NOT_FOUND', error: 'Channel not found' };
  }
  if (input.approvalRequired) {
    return {
      ok: false,
      status: 409,
      code: 'CONTENT_APPROVAL_REQUIRED',
      error: 'Your church reviews channel posts first. Ask an admin or pastor to publish this plan.',
    };
  }
  return { ok: true };
}

/** The caller's own steps, in plan order, skipping locked notes. */
async function loadOwnSteps(sequenceNoteIds: string | null, actorId: string) {
  const sequence = parseSequenceNoteIds(sequenceNoteIds);
  if (sequence.length === 0) return [];
  const rows = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      noteType: Notes.noteType,
      userId: Notes.userId,
      currentVersionId: Notes.currentVersionId,
    })
    .from(Notes)
    .where(and(inArray(Notes.id, sequence), eq(Notes.userId, actorId), eq(Notes.contentEncrypted, false)));
  return orderedCopySteps(sequence, rows);
}

export type PlanPublishResult = {
  threadId: string;
  channelSpaceId: string;
  noteCount: number;
  /** This plan was already published by this person; `channelSpaceId` is where it went. */
  alreadyPublished: boolean;
  pinned: boolean;
};

async function findExistingPublish(actorId: string, sourceThreadId: string) {
  return first(
    await db
      .select({ id: Threads.id, spaceId: Threads.spaceId })
      .from(Threads)
      .where(and(eq(Threads.userId, actorId), eq(Threads.copiedFromThreadId, sourceThreadId)))
      .limit(1),
  );
}

/** Publish a Home study plan into a channel. Callers must have run `decidePlanPublishToChannel`. */
export async function publishPlanToChannel(input: {
  source: { id: string; title: string; subtitle: string | null; color: string | null; sequenceNoteIds: string | null };
  actorId: string;
  channelSpaceId: string;
}): Promise<PlanPublishResult> {
  const { source, actorId, channelSpaceId } = input;

  const existing = await findExistingPublish(actorId, source.id);
  if (existing) {
    return {
      threadId: existing.id,
      channelSpaceId: existing.spaceId ?? channelSpaceId,
      noteCount: 0,
      alreadyPublished: true,
      pinned: false,
    };
  }

  const steps = await loadOwnSteps(source.sequenceNoteIds, actorId);
  await ensureUserMetadata(actorId);
  const homeSpaceId = await ensurePersonalHomeSpace(actorId);
  const effectiveHighest = await getEffectiveHighestSimpleNoteId(actorId);

  const threadId = generateThreadId();
  const now = nowISO();
  const noteRows = buildCopiedStepRows({ steps, threadId, homeSpaceId, actorId, base: Date.now() });
  const newIds = noteRows.map((row) => row.id);

  let pinned = false;
  try {
    await db.transaction(async (tx) => {
      const locked = first(
        await tx.select().from(UserMetadata).where(eq(UserMetadata.userId, actorId)).for('update').limit(1),
      );
      if (!locked) throw new Error('User metadata missing during study plan publish');

      // Pin only into a vacancy: never take a congregation off what it is mid-way through.
      const pinnedNow = first(
        await tx
          .select({ id: Threads.id })
          .from(Threads)
          .where(and(eq(Threads.spaceId, channelSpaceId), eq(Threads.isPinned, true)))
          .limit(1),
      );
      pinned = !pinnedNow;

      // First write: it carries the dedupe index's columns, so a racing second tap fails here.
      await tx.insert(Threads).values({
        id: threadId,
        title: source.title,
        subtitle: source.subtitle,
        spaceId: channelSpaceId,
        userId: actorId,
        color: source.color || 'paper',
        isPublic: false,
        isPinned: pinned,
        order: 0,
        mode: 'sequence',
        sequenceNoteIds: serializeSequenceNoteIds(newIds),
        sequenceCurrentNoteId: newIds[0] ?? null,
        createdAt: now,
        updatedAt: now,
        lastVisited: now,
        copiedFromThreadId: source.id,
        copiedFromAuthorId: actorId,
      });

      const firstSimple = await insertCopiedStepsInTx(tx, {
        noteRows,
        actorId,
        threadId,
        targetSpaceId: channelSpaceId,
        now,
        highestSimpleNoteId: Math.max(effectiveHighest, locked.highestSimpleNoteId ?? 0),
      });
      if (noteRows.length > 0) {
        await tx
          .update(UserMetadata)
          .set({ highestSimpleNoteId: firstSimple + noteRows.length - 1, updatedAt: now })
          .where(eq(UserMetadata.userId, actorId));
      }
    });
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const raced = await findExistingPublish(actorId, source.id);
    if (!raced) throw error;
    return {
      threadId: raced.id,
      channelSpaceId: raced.spaceId ?? channelSpaceId,
      noteCount: 0,
      alreadyPublished: true,
      pinned: false,
    };
  }

  await postProcessCopiedSteps(noteRows, actorId, threadId);

  return { threadId, channelSpaceId, noteCount: noteRows.length, alreadyPublished: false, pinned };
}
