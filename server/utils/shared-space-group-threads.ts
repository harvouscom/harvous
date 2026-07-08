import { db, Threads, Notes, NoteThreads, eq, and, count, desc, inArray } from '../db';
import { requireSpaceAccess } from './space-access';

export type GroupStudyThreadRow = {
  id: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  spaceId: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  ownerUserId: string;
};

export async function listGroupStudyThreadsForSpace(
  spaceId: string,
  userId: string,
): Promise<GroupStudyThreadRow[]> {
  await requireSpaceAccess(spaceId, userId);

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
    })
    .from(Threads)
    .where(eq(Threads.spaceId, spaceId))
    .orderBy(desc(Threads.isPinned), desc(Threads.updatedAt));

  const filtered = threads.filter((t) => t.id !== 'thread_unorganized' && !t.id.startsWith('thread_onboarding_'));
  const threadIds = filtered.map((t) => t.id);
  if (threadIds.length === 0) return [];

  const countRows = await db
    .select({ threadId: NoteThreads.threadId, noteCount: count() })
    .from(NoteThreads)
    .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
    .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.spaceId, spaceId)))
    .groupBy(NoteThreads.threadId);

  const countMap = new Map(countRows.map((r) => [r.threadId, Number(r.noteCount)]));

  return filtered.map((t) => ({
    ...t,
    isPinned: Boolean(t.isPinned),
    noteCount: countMap.get(t.id) ?? 0,
  }));
}
