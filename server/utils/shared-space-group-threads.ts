import { db, Threads, Notes, NoteThreads, SpaceNotes, eq, and, count, desc, inArray, isNull } from '../db';
import { isActualSpaceOwner, requireSpaceAccess } from './space-access';
import { isSequenceMode, resolveSequenceState } from './thread-sequence';

export type GroupStudyThreadRow = {
  id: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  spaceId: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date | null;
  noteCount: number;
  ownerUserId: string;
  /** 'collection' | 'sequence'. */
  mode: string;
  /** 1-based step the cohort is on; 0 when the Thread is not a sequence. */
  sequenceCurrentIndex: number;
  /** Steps in the plan; 0 when the Thread is not a sequence. */
  sequenceTotal: number;
};

export async function listGroupStudyThreadsForSpace(
  spaceId: string,
  userId: string,
): Promise<GroupStudyThreadRow[]> {
  const access = await requireSpaceAccess(spaceId, userId);

  const threads = await db
    .select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
      ownerUserId: Threads.userId,
      mode: Threads.mode,
      sequenceNoteIds: Threads.sequenceNoteIds,
      sequenceCurrentNoteId: Threads.sequenceCurrentNoteId,
    })
    .from(Threads)
    .where(eq(Threads.spaceId, spaceId))
    .orderBy(desc(Threads.isPinned), desc(Threads.updatedAt));

  /*
    Members see the current Thread and nothing else — that focus is the point.
    Leaders see all of them, because someone who can author a study plan has to
    be able to reach the one that isn't current yet in order to make it so.
  */
  const canSeeUnpinned = isActualSpaceOwner(access.space, userId) || access.role === 'leader';
  const filtered = threads.filter(
    (thread) =>
      thread.id !== 'thread_unorganized' &&
      !thread.id.startsWith('thread_onboarding_') &&
      (canSeeUnpinned || thread.isPinned),
  );
  const threadIds = filtered.map((t) => t.id);
  if (threadIds.length === 0) return [];

  const countRows = await db
    .select({ threadId: NoteThreads.threadId, noteCount: count() })
    .from(NoteThreads)
    .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
    .innerJoin(
      SpaceNotes,
      and(eq(SpaceNotes.noteId, Notes.id), eq(SpaceNotes.spaceId, spaceId)),
    )
    .where(and(inArray(NoteThreads.threadId, threadIds), isNull(SpaceNotes.removedAt), eq(Notes.contentEncrypted, false)))
    .groupBy(NoteThreads.threadId);

  const countMap = new Map(countRows.map((r) => [r.threadId, Number(r.noteCount)]));

  /*
    Step positions need the ids, not just the count — and only sequence
    Threads need them, so a space full of ordinary Threads pays nothing.
  */
  const sequenceThreadIds = filtered.filter((t) => isSequenceMode(t.mode)).map((t) => t.id);
  const stepIdsByThread = new Map<string, string[]>();
  if (sequenceThreadIds.length > 0) {
    const stepRows = await db
      .select({ threadId: NoteThreads.threadId, noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
      .innerJoin(SpaceNotes, and(eq(SpaceNotes.noteId, Notes.id), eq(SpaceNotes.spaceId, spaceId)))
      .where(
        and(
          inArray(NoteThreads.threadId, sequenceThreadIds),
          isNull(SpaceNotes.removedAt),
          eq(Notes.contentEncrypted, false),
        ),
      );
    for (const row of stepRows) {
      const ids = stepIdsByThread.get(row.threadId);
      if (ids) ids.push(row.noteId);
      else stepIdsByThread.set(row.threadId, [row.noteId]);
    }
  }

  return filtered.map((t) => {
    const { sequenceNoteIds, sequenceCurrentNoteId, ...rest } = t;
    const state = isSequenceMode(t.mode)
      ? resolveSequenceState(
          { sequenceNoteIds, sequenceCurrentNoteId },
          stepIdsByThread.get(t.id) ?? [],
        )
      : null;
    return {
      ...rest,
      mode: t.mode ?? 'collection',
      isPinned: Boolean(t.isPinned),
      noteCount: countMap.get(t.id) ?? 0,
      sequenceCurrentIndex: state?.currentIndex ?? 0,
      sequenceTotal: state?.total ?? 0,
    };
  });
}
