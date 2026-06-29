import {
  db,
  first,
  Spaces,
  Threads,
  Notes,
  NoteThreads,
  Members,
  eq,
  and,
  count,
  inArray,
  isNotNull,
} from '../db';

export type AdminContentSpace = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  isFeatured: boolean;
  shareToken: string | null;
  joinUrl: string | null;
  threadCount: number;
  noteCount: number;
  memberCount: number;
  createdAt: string;
};

export type AdminContentThread = {
  id: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  noteCount: number;
  createdAt: string;
};

export function buildJoinUrl(origin: string, shareToken: string | null | undefined): string | null {
  if (!shareToken) return null;
  const base = origin.replace(/\/$/, '');
  return `${base}/spaces/join/${shareToken}`;
}

export function countMap(rows: Array<{ key: string; cnt: number }>): Map<string, number> {
  return new Map(rows.map((r) => [r.key, r.cnt]));
}

export async function getAdminContentSpaces(
  systemUserId: string,
  origin: string,
): Promise<AdminContentSpace[]> {
  const spaceRows = await db
    .select({
      id: Spaces.id,
      title: Spaces.title,
      description: Spaces.description,
      color: Spaces.color,
      isFeatured: Spaces.isFeatured,
      shareToken: Spaces.shareToken,
      createdAt: Spaces.createdAt,
    })
    .from(Spaces)
    .where(eq(Spaces.userId, systemUserId))
    .orderBy(Spaces.createdAt);

  if (spaceRows.length === 0) return [];

  const spaceIds = spaceRows.map((s) => s.id);

  const [memberCounts, threadCounts, noteCounts] = await Promise.all([
    db
      .select({ key: Members.spaceId, cnt: count() })
      .from(Members)
      .where(inArray(Members.spaceId, spaceIds))
      .groupBy(Members.spaceId),
    db
      .select({ key: Threads.spaceId, cnt: count() })
      .from(Threads)
      .where(and(isNotNull(Threads.spaceId), inArray(Threads.spaceId, spaceIds)))
      .groupBy(Threads.spaceId),
    db
      .select({ key: Notes.spaceId, cnt: count() })
      .from(Notes)
      .where(and(isNotNull(Notes.spaceId), inArray(Notes.spaceId, spaceIds)))
      .groupBy(Notes.spaceId),
  ]);

  const memberMap = countMap(memberCounts);
  const threadMap = countMap(threadCounts.map((r) => ({ key: r.key!, cnt: r.cnt })));
  const noteMap = countMap(noteCounts.map((r) => ({ key: r.key!, cnt: r.cnt })));

  return spaceRows.map((space) => ({
    id: space.id,
    title: space.title,
    description: space.description,
    color: space.color,
    isFeatured: space.isFeatured ?? false,
    shareToken: space.shareToken,
    joinUrl: buildJoinUrl(origin, space.shareToken),
    threadCount: threadMap.get(space.id) ?? 0,
    noteCount: noteMap.get(space.id) ?? 0,
    memberCount: memberMap.get(space.id) ?? 0,
    createdAt: space.createdAt,
  }));
}

export async function getAdminContentSpaceThreads(
  systemUserId: string,
  spaceId: string,
): Promise<AdminContentThread[] | null> {
  const space = first(
    await db
      .select({ id: Spaces.id })
      .from(Spaces)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, systemUserId)))
      .limit(1),
  );
  if (!space) return null;

  const threadRows = await db
    .select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      createdAt: Threads.createdAt,
    })
    .from(Threads)
    .where(eq(Threads.spaceId, spaceId))
    .orderBy(Threads.createdAt);

  if (threadRows.length === 0) return [];

  const threadIds = threadRows.map((t) => t.id);
  const noteCounts = await db
    .select({ key: NoteThreads.threadId, cnt: count() })
    .from(Notes)
    .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(inArray(NoteThreads.threadId, threadIds))
    .groupBy(NoteThreads.threadId);

  // Fallback: notes with threadId set directly
  const directNoteCounts = await db
    .select({ key: Notes.threadId, cnt: count() })
    .from(Notes)
    .where(and(eq(Notes.spaceId, spaceId), inArray(Notes.threadId, threadIds)))
    .groupBy(Notes.threadId);

  const noteMap = new Map<string, number>();
  for (const row of noteCounts) {
    if (row.key) noteMap.set(row.key, (noteMap.get(row.key) ?? 0) + row.cnt);
  }
  for (const row of directNoteCounts) {
    if (row.key) noteMap.set(row.key, (noteMap.get(row.key) ?? 0) + row.cnt);
  }

  return threadRows.map((thread) => ({
    id: thread.id,
    title: thread.title,
    subtitle: thread.subtitle,
    color: thread.color,
    noteCount: noteMap.get(thread.id) ?? 0,
    createdAt: thread.createdAt,
  }));
}
