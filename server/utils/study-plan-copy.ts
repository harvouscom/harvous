/**
 * Curriculum handoff — take a channel's study plan and walk it somewhere else.
 *
 * A church publishes a study plan into a ministry channel. Two people want it
 * elsewhere: a follower who wants to walk it in their own study (My Home), and
 * a small-group leader who wants their group to walk it together (a Shared
 * Space they lead). Both get an independent copy — the church's plan and every
 * step note stay untouched, exactly like every other copy in Harvous.
 *
 * Why not `POST /api/shared/add-to-harvous`: that route orders notes by when
 * they were last visited and writes a plain collection Thread. A study plan's
 * whole point is its order, so the copy keeps `mode='sequence'`, the step order,
 * and puts the copy at the first step.
 *
 * One copy per person per source, enforced by `Threads_copiedFromThread_unique`
 * (userId, copiedFromThreadId). A leader who copied a plan into their group and
 * later wants it in Home too is pointed at the copy they already have rather
 * than being handed a second; widening the index to per-destination is a
 * migration this V1 does not need.
 */
import {
  db,
  first,
  Notes,
  NoteThreads,
  SpaceNotes,
  Threads,
  UserMetadata,
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId, generateThreadId } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { ensurePersonalHomeSpace } from './ensure-personal-home-space';
import { getEffectiveHighestSimpleNoteId } from './highest-simple-note-id';
import { createInitialNoteVersion } from './note-version-service';
import { buildIndependentCopyAttribution } from './note-versioning';
import { isUniqueViolationError } from './db-errors';
import {
  processScriptureReferences,
  transformCanonicalScriptureContent,
} from './process-scripture-references';
import { parseSequenceNoteIds, serializeSequenceNoteIds } from './thread-sequence';

export type StudyPlanCopyDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404; code: string; error: string };

/**
 * Whether this copy may happen. Pure; the route supplies what it looked up.
 *
 * The source must be a study plan (a sequence Thread) in a ministry channel the
 * caller belongs to. A target of null is the caller's own Home, open to any
 * follower. A named target must be a Shared Space where the caller holds the
 * thread structure — handing a group a plan is a leader's act.
 */
export function decideStudyPlanCopy(input: {
  thread: { spaceId: string | null; mode: string } | null;
  sourceSpace: { type: string | null; orgId: string | null; deletedAt: unknown } | null;
  channelSpaceId: string;
  callerIsMember: boolean;
  target:
    | null
    | {
        spaceId: string;
        type: string | null;
        deletedAt: unknown;
        callerCanManageThreads: boolean;
      };
}): StudyPlanCopyDecision {
  const { thread, sourceSpace, target } = input;
  if (
    !thread ||
    thread.spaceId !== input.channelSpaceId ||
    !sourceSpace ||
    sourceSpace.deletedAt ||
    sourceSpace.type !== 'public' ||
    !sourceSpace.orgId
  ) {
    return { ok: false, status: 404, code: 'STUDY_PLAN_NOT_FOUND', error: 'That study plan is no longer available' };
  }
  if (!input.callerIsMember) {
    return { ok: false, status: 403, code: 'CHANNEL_FOLLOW_REQUIRED', error: 'Follow this channel to use its study plans' };
  }
  if (thread.mode !== 'sequence') {
    return { ok: false, status: 400, code: 'NOT_A_STUDY_PLAN', error: 'Only a study plan can be copied this way' };
  }
  if (!target) return { ok: true };
  if (target.spaceId === input.channelSpaceId) {
    return { ok: false, status: 400, code: 'SAME_SPACE', error: 'Pick a different space' };
  }
  if (!target.type || target.type !== 'shared' || target.deletedAt) {
    return { ok: false, status: 404, code: 'TARGET_NOT_FOUND', error: 'Pick one of your shared spaces' };
  }
  if (!target.callerCanManageThreads) {
    return {
      ok: false,
      status: 403,
      code: 'SPACE_THREAD_ROLE_REQUIRED',
      error: 'Only the space’s owner or a leader can give it a study plan',
    };
  }
  return { ok: true };
}

/**
 * The steps to copy, in plan order.
 *
 * The Thread's own sequence is the order. A step removed from the channel, or
 * locked, is dropped rather than copied — the same notes a follower can see.
 */
export function orderedCopySteps<T extends { id: string }>(
  sequenceNoteIds: readonly string[],
  visibleNotes: readonly T[],
): T[] {
  const byId = new Map(visibleNotes.map((note) => [note.id, note]));
  const ordered: T[] = [];
  for (const id of sequenceNoteIds) {
    const note = byId.get(id);
    if (note) ordered.push(note);
  }
  return ordered;
}

export type StudyPlanCopyResult = {
  threadId: string;
  /** Where the copy lives: a Shared Space id, or null for the caller's Home. */
  spaceId: string | null;
  noteCount: number;
  alreadyCopied: boolean;
  pinned: boolean;
};

async function findExistingCopy(userId: string, sourceThreadId: string) {
  return first(
    await db
      .select({ id: Threads.id, spaceId: Threads.spaceId })
      .from(Threads)
      .where(and(eq(Threads.userId, userId), eq(Threads.copiedFromThreadId, sourceThreadId)))
      .limit(1),
  );
}

/** The caller's metadata row, created the way the shared-thread import does. */
async function ensureUserMetadata(userId: string): Promise<void> {
  const existing = first(
    await db.select({ id: UserMetadata.id }).from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1),
  );
  if (existing) return;
  const highest = first(
    await db
      .select({ simpleNoteId: Notes.simpleNoteId })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), isNotNull(Notes.simpleNoteId)))
      .orderBy(desc(Notes.simpleNoteId))
      .limit(1),
  );
  await db.insert(UserMetadata).values({
    id: `user_metadata_${userId}`,
    userId,
    highestSimpleNoteId: highest?.simpleNoteId ?? 0,
    currentSeason: getCurrentSeason(),
    createdAt: nowISO(),
  });
}

/**
 * Copy a channel's study plan. Callers must have run `decideStudyPlanCopy`.
 */
export async function copyStudyPlanThread(input: {
  source: {
    id: string;
    title: string;
    subtitle: string | null;
    color: string | null;
    userId: string;
    spaceId: string;
    sequenceNoteIds: string | null;
  };
  actorId: string;
  targetSpaceId: string | null;
}): Promise<StudyPlanCopyResult> {
  const { source, actorId, targetSpaceId } = input;

  const existing = await findExistingCopy(actorId, source.id);
  if (existing) {
    return { threadId: existing.id, spaceId: existing.spaceId, noteCount: 0, alreadyCopied: true, pinned: false };
  }

  const sequence = parseSequenceNoteIds(source.sequenceNoteIds);
  const visible =
    sequence.length > 0
      ? await db
          .select({
            id: Notes.id,
            title: Notes.title,
            content: Notes.content,
            noteType: Notes.noteType,
            userId: Notes.userId,
            currentVersionId: Notes.currentVersionId,
          })
          .from(Notes)
          .innerJoin(
            SpaceNotes,
            and(eq(SpaceNotes.noteId, Notes.id), eq(SpaceNotes.spaceId, source.spaceId), isNull(SpaceNotes.removedAt)),
          )
          .where(and(inArray(Notes.id, sequence), eq(Notes.contentEncrypted, false)))
      : [];
  const steps = orderedCopySteps(sequence, visible);

  await ensureUserMetadata(actorId);
  const homeSpaceId = await ensurePersonalHomeSpace(actorId);
  const effectiveHighest = await getEffectiveHighestSimpleNoteId(actorId);

  const threadId = generateThreadId();
  const now = nowISO();
  const base = Date.now();
  const noteRows = steps.map((step, index) => {
    const id = generateNoteId();
    return {
      id,
      title: step.title || null,
      content: transformCanonicalScriptureContent({
        noteId: id,
        content: step.content ?? '',
        translation: 'NET',
        pillsOnly: step.noteType !== 'scripture',
      }).updatedContent,
      threadId,
      // The copier's home, not the group — the group is the SpaceNotes row below,
      // the same split `publishSeriesAsStudyPlan` uses.
      spaceId: homeSpaceId,
      simpleNoteId: 0,
      noteType: step.noteType || 'default',
      userId: actorId,
      isPublic: false,
      contentEncrypted: false,
      createdAt: new Date(base + index),
      updatedAt: new Date(base + index),
      lastVisited: null,
      ...buildIndependentCopyAttribution({
        sourceNoteId: step.id,
        sourceVersionId: step.currentVersionId,
        sourceAuthorId: step.userId,
        sourceAuthorDisplayName: null,
      }),
    };
  });
  const newIds = noteRows.map((row) => row.id);

  let pinned = false;
  try {
    await db.transaction(async (tx) => {
      const locked = first(
        await tx.select().from(UserMetadata).where(eq(UserMetadata.userId, actorId)).for('update').limit(1),
      );
      if (!locked) throw new Error('User metadata missing during study plan copy');

      if (targetSpaceId) {
        // Pin only into a vacancy — never take a group off what it is mid-way through.
        const pinnedNow = first(
          await tx
            .select({ id: Threads.id })
            .from(Threads)
            .where(and(eq(Threads.spaceId, targetSpaceId), eq(Threads.isPinned, true)))
            .limit(1),
        );
        pinned = !pinnedNow;
      }

      // First write, deliberately: it carries the dedupe index's columns, so a
      // racing second copy fails here before any note lands.
      await tx.insert(Threads).values({
        id: threadId,
        title: source.title,
        subtitle: source.subtitle,
        spaceId: targetSpaceId,
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
        copiedFromAuthorId: source.userId,
      });

      const firstSimple = Math.max(effectiveHighest, locked.highestSimpleNoteId ?? 0) + 1;
      noteRows.forEach((row, index) => {
        row.simpleNoteId = firstSimple + index;
      });
      if (noteRows.length > 0) await tx.insert(Notes).values(noteRows);
      for (const row of noteRows) {
        await createInitialNoteVersion(tx, {
          noteId: row.id,
          noteAuthorId: actorId,
          content: { title: row.title, content: row.content, contentEncrypted: false },
          createdAt: row.createdAt,
          source: 'study-plan-copy',
        });
      }
      if (noteRows.length > 0) {
        await tx.insert(NoteThreads).values(
          noteRows.map((row) => ({ id: `nt_${crypto.randomUUID()}`, noteId: row.id, threadId, createdAt: now })),
        );
      }
      if (targetSpaceId && noteRows.length > 0) {
        await tx.insert(SpaceNotes).values(
          noteRows.map((row) => ({
            id: `sn_${crypto.randomUUID()}`,
            spaceId: targetSpaceId,
            noteId: row.id,
            addedBy: actorId,
            addedAt: now,
          })),
        );
      }
      if (noteRows.length > 0) {
        await tx
          .update(UserMetadata)
          .set({ highestSimpleNoteId: firstSimple + noteRows.length - 1, updatedAt: now })
          .where(eq(UserMetadata.userId, actorId));
      }
    });
  } catch (error) {
    // Only a violation attributable to a real prior copy is read as "already
    // copied"; any other collision is a genuine fault.
    if (!isUniqueViolationError(error)) throw error;
    const raced = await findExistingCopy(actorId, source.id);
    if (!raced) throw error;
    return { threadId: raced.id, spaceId: raced.spaceId, noteCount: 0, alreadyCopied: true, pinned: false };
  }

  for (const row of noteRows) {
    if (!row.content) continue;
    try {
      await processScriptureReferences(row.id, actorId, threadId, row.content, 'NET', {
        pillsOnly: row.noteType !== 'scripture',
        persistParentContent: false,
      });
    } catch (error) {
      console.warn('[study-plan-copy] copy landed; scripture postprocessing failed', { noteId: row.id, error });
    }
  }

  return { threadId, spaceId: targetSpaceId, noteCount: noteRows.length, alreadyCopied: false, pinned };
}
