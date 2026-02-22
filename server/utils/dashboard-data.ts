/**
 * Dashboard data utilities — Drizzle port of src/utils/dashboard-data.ts
 *
 * Only the functions needed by /api/navigation/data are ported here:
 *   - getAllThreadsWithCounts(userId)
 *   - getSpacesWithCounts(userId)
 *   - getMemberOfSpaces(userId)
 *   - getInboxDisplayCount(userId)
 *
 * Also includes the private findUnorganizedThread(userId) helper.
 */

import {
  db, Threads, Notes, Spaces, Members, NoteThreads,
  eq, and, desc, asc, count, ne, isNull, isNotNull, inArray, sql,
} from '../db';
import { nowISO } from '../db/dates';
import { getThreadColorCSS, getThreadGradientCSS } from "@/utils/colors";
import { getInboxCount as getInboxCountUtil } from "./inbox-data";

// ─── Private helpers ────────────────────────────────────────────────────────────

/**
 * Find (or create) the "Unorganized" thread for a user.
 */
async function findUnorganizedThread(userId: string) {
  try {
    const unorganizedThread = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
    })
    .from(Threads)
    .where(and(
      eq(Threads.userId, userId),
      eq(Threads.id, "thread_unorganized")
    ))
    .get();

    if (unorganizedThread) {
      return unorganizedThread;
    }

    // If not found, create it
    try {
      const newUnorganizedThread = await db.insert(Threads).values({
        id: "thread_unorganized",
        title: "Unorganized",
        subtitle: "Notes that haven't been organized into threads yet",
        spaceId: null,
        userId: userId,
        isPublic: true,
        isPinned: false,
        color: null,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }).returning().get();

      return newUnorganizedThread;
    } catch (createError: any) {
      // If creation failed due to constraint, it means another process created it
      if (createError.code === 'SQLITE_CONSTRAINT' ||
          createError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
          createError.rawCode === 1555 ||
          createError.message?.includes('UNIQUE constraint failed')) {
        // Try to fetch it again
        const existingThread = await db.select({
          id: Threads.id,
          title: Threads.title,
          subtitle: Threads.subtitle,
          color: Threads.color,
          spaceId: Threads.spaceId,
          isPublic: Threads.isPublic,
          isPinned: Threads.isPinned,
          createdAt: Threads.createdAt,
          updatedAt: Threads.updatedAt,
        })
        .from(Threads)
        .where(and(
          eq(Threads.userId, userId),
          eq(Threads.id, "thread_unorganized")
        ))
        .get();

        return existingThread;
      }
      throw createError;
    }
  } catch (error) {
    console.error("Error finding/creating unorganized thread:", error);
    return null;
  }
}

/**
 * Get the member count for a space (inlined from tier-limits.ts).
 */
async function getSpaceMemberCount(spaceId: string): Promise<number> {
  const members = await db.select()
    .from(Members)
    .where(eq(Members.spaceId, spaceId))
    .all();
  return members.length;
}

// ─── Exported functions ─────────────────────────────────────────────────────────

export async function getAllThreadsWithCounts(userId: string) {
  try {
    const threads = await db.select({
      id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
      color: Threads.color, spaceId: Threads.spaceId,
      isPublic: Threads.isPublic, isPinned: Threads.isPinned,
      createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited,
    })
    .from(Threads)
    .where(and(
      eq(Threads.userId, userId),
      ne(Threads.id, "thread_unorganized")
    ))
    .orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited),
      desc(Threads.updatedAt),
      desc(Threads.createdAt),
      asc(Threads.id)
    )
    .all();

    const threadIds = threads.map(thread => thread.id);
    let noteCountsMap = new Map<string, number>();

    if (threadIds.length > 0) {
      const noteCounts = await db.select({
        threadId: NoteThreads.threadId,
        count: count(),
      })
      .from(NoteThreads)
      .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
      .where(and(
        inArray(NoteThreads.threadId, threadIds),
        eq(Notes.userId, userId)
      ))
      .groupBy(NoteThreads.threadId)
      .all();

      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }

    const threadsWithCounts = threads.map(thread => ({
      ...thread,
      noteCount: noteCountsMap.get(thread.id) || 0
    }));

    return threadsWithCounts.map(thread => ({
      id: thread.id, title: thread.title, subtitle: thread.subtitle,
      color: thread.color, spaceId: thread.spaceId,
      isPublic: thread.isPublic, isPinned: thread.isPinned,
      createdAt: thread.createdAt, updatedAt: thread.updatedAt,
      lastVisited: thread.lastVisited,
      noteCount: thread.noteCount || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    }));
  } catch (error) {
    console.error("Error fetching threads:", error);
    return [];
  }
}

export async function getSpacesWithCounts(userId: string) {
  try {
    const spacesWithThreadCounts = await db.select({
      id: Spaces.id, title: Spaces.title, description: Spaces.description,
      color: Spaces.color, backgroundGradient: Spaces.backgroundGradient,
      isPublic: Spaces.isPublic, isActive: Spaces.isActive,
      createdAt: Spaces.createdAt, updatedAt: Spaces.updatedAt,
      lastVisited: Spaces.lastVisited,
      threadCount: count(Threads.id),
    })
    .from(Spaces)
    .leftJoin(Threads, eq(Spaces.id, Threads.spaceId))
    .where(eq(Spaces.userId, userId))
    .groupBy(Spaces.id)
    .orderBy(
      desc(Spaces.isActive),
      asc(sql`CASE WHEN ${Spaces.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Spaces.lastVisited),
      desc(Spaces.updatedAt),
      desc(Spaces.createdAt)
    )
    .all();

    const standaloneNoteCounts = await db.select({
      spaceId: Notes.spaceId,
      standaloneNoteCount: count(Notes.id),
    })
    .from(Notes)
    .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(and(
      eq(Notes.userId, userId),
      isNull(NoteThreads.id),
      isNotNull(Notes.spaceId)
    ))
    .groupBy(Notes.spaceId)
    .all();

    const totalNoteCounts = await db.select({
      spaceId: Notes.spaceId,
      totalNoteCount: count(Notes.id),
    })
    .from(Notes)
    .where(and(
      eq(Notes.userId, userId),
      isNotNull(Notes.spaceId)
    ))
    .groupBy(Notes.spaceId)
    .all();

    const standaloneCountMap = new Map(standaloneNoteCounts.map(item => [item.spaceId, item.standaloneNoteCount]));
    const totalCountMap = new Map(totalNoteCounts.map(item => [item.spaceId, item.totalNoteCount]));

    return spacesWithThreadCounts.map(space => ({
      id: space.id, title: space.title, description: space.description,
      color: space.color, backgroundGradient: space.backgroundGradient,
      isPublic: space.isPublic, isActive: space.isActive,
      createdAt: space.createdAt, updatedAt: space.updatedAt,
      lastVisited: space.lastVisited,
      threadCount: space.threadCount || 0,
      standaloneNoteCount: standaloneCountMap.get(space.id) || 0,
      totalItemCount: (space.threadCount || 0) + (totalCountMap.get(space.id) || 0),
      totalNoteCount: totalCountMap.get(space.id) || 0,
      lastUpdated: space.lastVisited || space.updatedAt || space.createdAt,
    }));
  } catch (error) {
    console.error("Error fetching spaces:", error);
    return [];
  }
}

export async function getMemberOfSpaces(userId: string): Promise<Array<{ id: string; title: string | null; color: string | null; memberCount: number }>> {
  try {
    const memberships = await db
      .select({ spaceId: Members.spaceId })
      .from(Members)
      .where(eq(Members.userId, userId))
      .all();

    const ownedSpaceIds = await db
      .select({ id: Spaces.id })
      .from(Spaces)
      .where(eq(Spaces.userId, userId))
      .all();
    const ownedSet = new Set(ownedSpaceIds.map((r) => r.id));

    const memberOf: Array<{ id: string; title: string | null; color: string | null; memberCount: number }> = [];
    for (const m of memberships) {
      if (ownedSet.has(m.spaceId)) continue;
      const spaceRow = await db
        .select({ id: Spaces.id, title: Spaces.title, color: Spaces.color })
        .from(Spaces)
        .where(eq(Spaces.id, m.spaceId))
        .get();
      if (spaceRow) {
        const memberCount = await getSpaceMemberCount(spaceRow.id);
        memberOf.push({ id: spaceRow.id, title: spaceRow.title, color: spaceRow.color, memberCount });
      }
    }
    return memberOf;
  } catch (error) {
    console.error("Error fetching member-of spaces:", error);
    return [];
  }
}

export async function getInboxDisplayCount(userId: string) {
  try {
    return await getInboxCountUtil(userId);
  } catch (error) {
    console.error("Error fetching inbox display count:", error);
    return 0;
  }
}
