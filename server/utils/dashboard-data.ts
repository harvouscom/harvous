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
  NoteScriptureReferences, ScriptureMetadata, ResourceMetadata,
  eq, and, desc, asc, count, ne, isNull, isNotNull, inArray, sql,
} from '../db';
import { nowISO } from '../db/dates';
import { getThreadColorCSS, getThreadGradientCSS } from "@/utils/colors";
import { getInboxCount as getInboxCountUtil } from "./inbox-data";
import { sortByLastVisited } from "@/utils/sorting";
import { stripHtml } from "@/utils/html-stripper";

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
      // If creation failed due to UNIQUE on id, another user already has the single global row
      if (createError.code === 'SQLITE_CONSTRAINT' ||
          createError.cause?.code === 'SQLITE_CONSTRAINT' ||
          createError.rawCode === 1555 ||
          createError.message?.includes('UNIQUE constraint failed')) {
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
        .where(eq(Threads.id, "thread_unorganized"))
        .get();

        return existingThread ?? undefined;
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
    // Run all three independent count queries in parallel
    const [spacesWithThreadCounts, standaloneNoteCounts, totalNoteCounts] = await Promise.all([
      db.select({
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
      .all(),

      db.select({
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
      .all(),

      db.select({
        spaceId: Notes.spaceId,
        totalNoteCount: count(Notes.id),
      })
      .from(Notes)
      .where(and(
        eq(Notes.userId, userId),
        isNotNull(Notes.spaceId)
      ))
      .groupBy(Notes.spaceId)
      .all(),
    ]);

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
    const [memberships, ownedSpaceIds] = await Promise.all([
      db.select({ spaceId: Members.spaceId }).from(Members).where(eq(Members.userId, userId)).all(),
      db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, userId)).all(),
    ]);
    const ownedSet = new Set(ownedSpaceIds.map((r) => r.id));

    const nonOwnedMemberships = memberships.filter(m => !ownedSet.has(m.spaceId));
    const results = await Promise.all(
      nonOwnedMemberships.map(async (m) => {
        const spaceRow = await db
          .select({ id: Spaces.id, title: Spaces.title, color: Spaces.color })
          .from(Spaces)
          .where(eq(Spaces.id, m.spaceId))
          .get();
        if (!spaceRow) return null;
        const memberCount = await getSpaceMemberCount(spaceRow.id);
        return { id: spaceRow.id, title: spaceRow.title, color: spaceRow.color, memberCount };
      })
    );
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
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

// ─── Thread helpers ─────────────────────────────────────────────────────────────

export async function getThreadWithCount(threadId: string, userId: string) {
  try {
    const thread = await db.select({
      id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
      color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
      isPublic: Threads.isPublic, isPinned: Threads.isPinned,
      createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited,
    })
    .from(Threads)
    .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
    .get();

    if (!thread) return null;

    const noteCountResult = await db.select({ count: count() })
      .from(NoteThreads)
      .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
      .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)))
      .get();

    const noteCount = noteCountResult?.count || 0;

    return {
      ...thread, noteCount,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    };
  } catch (error) {
    console.error("Error fetching thread with count:", error);
    return null;
  }
}

export async function getThreadsWithCountsLimited(userId: string, limit?: number) {
  try {
    const baseQuery = db.select({
      id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
      color: Threads.color, spaceId: Threads.spaceId,
      isPublic: Threads.isPublic, isPinned: Threads.isPinned,
      createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited,
    })
    .from(Threads)
    .where(and(eq(Threads.userId, userId), ne(Threads.id, "thread_unorganized")))
    .orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt), asc(Threads.id)
    );
    const threads = limit != null ? await baseQuery.limit(limit).all() : await baseQuery.all();

    const threadIds = threads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId)))
        .groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }

    return threads.map(thread => ({
      ...thread,
      noteCount: noteCountsMap.get(thread.id) || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    }));
  } catch (error) {
    console.error("Error fetching threads:", error);
    return [];
  }
}

// ─── Thread colors ──────────────────────────────────────────────────────────────

export async function getThreadColorsForNotesBatch(
  noteIds: string[], userId: string
): Promise<Map<string, Array<{ color: string; frequency: number }>>> {
  if (noteIds.length === 0) return new Map();
  try {
    const allNoteThreads = await db.select({
      noteId: NoteThreads.noteId, threadId: NoteThreads.threadId, color: Threads.color,
    })
    .from(NoteThreads)
    .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
    .where(and(inArray(NoteThreads.noteId, noteIds), eq(Threads.userId, userId), ne(Threads.id, "thread_unorganized")))
    .all();

    const noteColorMap = new Map<string, Map<string, number>>();
    for (const nt of allNoteThreads) {
      if (nt.color) {
        if (!noteColorMap.has(nt.noteId)) noteColorMap.set(nt.noteId, new Map());
        const colorMap = noteColorMap.get(nt.noteId)!;
        colorMap.set(nt.color, (colorMap.get(nt.color) || 0) + 1);
      }
    }

    const result = new Map<string, Array<{ color: string; frequency: number }>>();
    for (const [noteId, colorMap] of noteColorMap.entries()) {
      result.set(noteId, Array.from(colorMap.entries()).map(([color, frequency]) => ({ color, frequency })));
    }
    return result;
  } catch (error) {
    console.error("Error batch fetching thread colors for notes:", error);
    return new Map();
  }
}

export async function getThreadColorsForNotesAsRecord(
  noteIds: string[], userId: string
): Promise<Record<string, Array<{ color: string; frequency: number }>>> {
  const mapResult = await getThreadColorsForNotesBatch(noteIds, userId);
  const record: Record<string, Array<{ color: string; frequency: number }>> = {};
  for (const [noteId, colors] of mapResult.entries()) record[noteId] = colors;
  return record;
}

// ─── Note type counts ───────────────────────────────────────────────────────────

export async function getThreadNoteTypeCounts(threadId: string, userId: string) {
  try {
    let allCount = 0, defaultCount = 0, scriptureCount = 0, resourceCount = 0;

    if (threadId === 'thread_unorganized') {
      const allNotes = await db.select({ id: Notes.id, noteType: Notes.noteType })
        .from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(Notes.userId, userId), isNull(NoteThreads.id))).all();
      allCount = allNotes.length;
      defaultCount = allNotes.filter(n => !n.noteType || n.noteType === 'default').length;
      scriptureCount = allNotes.filter(n => n.noteType === 'scripture').length;
      resourceCount = allNotes.filter(n => n.noteType === 'resource').length;
    } else {
      const allNotes = await db.select({ id: Notes.id, noteType: Notes.noteType })
        .from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId))).all();
      allCount = allNotes.length;
      defaultCount = allNotes.filter(n => !n.noteType || n.noteType === 'default').length;
      scriptureCount = allNotes.filter(n => n.noteType === 'scripture').length;
      resourceCount = allNotes.filter(n => n.noteType === 'resource').length;
    }

    return { all: allCount, default: defaultCount, scripture: scriptureCount, resource: resourceCount };
  } catch (error) {
    console.error("Error fetching note type counts for thread:", error);
    return { all: 0, default: 0, scripture: 0, resource: 0 };
  }
}

// ─── Notes for thread ───────────────────────────────────────────────────────────

const NOTE_SELECT_COLUMNS = {
  id: Notes.id, title: Notes.title, content: Notes.content,
  contentEncrypted: Notes.contentEncrypted, threadId: Notes.threadId,
  spaceId: Notes.spaceId, simpleNoteId: Notes.simpleNoteId,
  noteType: Notes.noteType, isPublic: Notes.isPublic, isFeatured: Notes.isFeatured,
  createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, lastVisited: Notes.lastVisited,
} as const;

export async function getNotesForThread(threadId: string, userId: string, limit = 20, offset = 0) {
  try {
    const fetchLimit = limit + offset + 1;
    let allNotes: any[] = [];

    if (threadId === 'thread_unorganized') {
      const unorganizedNotes = await db.select({ ...NOTE_SELECT_COLUMNS, userId: Notes.userId })
        .from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(Notes.userId, userId), isNull(NoteThreads.id)))
        .orderBy(
          asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
          desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
        ).limit(fetchLimit).all();

      const unorganizedNoteIds = unorganizedNotes.map(n => n.id).filter(Boolean);
      let referencedScriptureNotes: typeof unorganizedNotes = [];
      if (unorganizedNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, unorganizedNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
          .all();
        const uniqueIds = [...new Set(refs.map(r => r.scriptureNoteId))];
        const alreadyIds = new Set(unorganizedNotes.filter(n => n.noteType === 'scripture').map(n => n.id));
        const additionalIds = uniqueIds.filter(id => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select({ ...NOTE_SELECT_COLUMNS, userId: Notes.userId })
            .from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture'))).all();
        }
      }
      const notesMap = new Map<string, (typeof unorganizedNotes)[0]>();
      [...unorganizedNotes, ...referencedScriptureNotes].forEach(n => { if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n); });
      allNotes = Array.from(notesMap.values());
    } else {
      const junctionNotes = await db.select({ ...NOTE_SELECT_COLUMNS, userId: Notes.userId })
        .from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)))
        .orderBy(
          asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
          desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
        ).limit(fetchLimit).all();

      const threadNoteIds = junctionNotes.map(n => n.id).filter(Boolean);
      let referencedScriptureNotes: typeof junctionNotes = [];
      if (threadNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, threadNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
          .all();
        const uniqueIds = [...new Set(refs.map(r => r.scriptureNoteId))];
        const alreadyIds = new Set(junctionNotes.filter(n => n.noteType === 'scripture').map(n => n.id));
        const additionalIds = uniqueIds.filter(id => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select({ ...NOTE_SELECT_COLUMNS, userId: Notes.userId })
            .from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture'))).all();
        }
      }
      const notesMap = new Map<string, (typeof junctionNotes)[0]>();
      [...junctionNotes, ...referencedScriptureNotes].forEach(n => { if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n); });
      allNotes = Array.from(notesMap.values());
    }

    const isOnboardingThread = threadId.startsWith('thread_onboarding_');
    const sortedAllNotes = isOnboardingThread
      ? allNotes.map(note => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || '' }))
          .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (aTime !== bTime) return aTime - bTime;
            if (a.id < b.id) return -1; if (a.id > b.id) return 1; return 0;
          })
      : sortByLastVisited(allNotes.map(note => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || '' })));

    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    // Fetch resource metadata and thread colors in parallel (independent queries)
    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];

    const [resourceMetadataMap, threadColorsMap] = await Promise.all([
      // Resource metadata
      (async () => {
        if (resourceNoteIds.length === 0) return {} as Record<string, any>;
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
            sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
          return rm.reduce((acc: any, meta) => {
            acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
            return acc;
          }, {} as Record<string, any>);
        } catch (_) { return {} as Record<string, any>; }
      })(),
      // Thread colors
      getThreadColorsForNotesBatch(noteIds, userId),
    ]);

    const notesWithThreadColors = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

    return { notes: notesWithThreadColors, hasMore };
  } catch (error) {
    console.error("Error fetching notes for thread:", error);
    return [];
  }
}

export async function getNotesForThreadForMember(
  threadId: string,
  ownerUserId: string,
  limit = 100,
  offset = 0
): Promise<{ notes: any[]; hasMore: boolean }> {
  try {
    const fetchLimit = limit + offset + 1;
    const junctionNotes = await db.select({ ...NOTE_SELECT_COLUMNS, userId: Notes.userId })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.contentEncrypted, false)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(fetchLimit).all();

    const sortedAllNotes = sortByLastVisited(junctionNotes.map(note => ({
      ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || ''
    })));
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];

    const [resourceMetadataMap, threadColorsMap] = await Promise.all([
      (async () => {
        if (resourceNoteIds.length === 0) return {} as Record<string, any>;
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
            sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
          return rm.reduce((acc: any, meta) => {
            acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
            return acc;
          }, {} as Record<string, any>);
        } catch (_) { return {} as Record<string, any>; }
      })(),
      getThreadColorsForNotesBatch(noteIds, ownerUserId),
    ]);

    const notesWithThreadColors = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

    return { notes: notesWithThreadColors, hasMore };
  } catch (error) {
    console.error("Error fetching notes for thread (member):", error);
    return { notes: [], hasMore: false };
  }
}

// ─── Dashboard note helpers ─────────────────────────────────────────────────────

export async function getUnorganizedNotesForDashboard(userId: string, limit = 10) {
  try {
    const notes = await db.select(NOTE_SELECT_COLUMNS)
      .from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(Notes.userId, userId), isNull(NoteThreads.id)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(limit).all();

    const noteIds = notes.map(n => n.id).filter(Boolean) as string[];
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    return notes.map(note => ({
      ...note,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
      threadColors: (threadColorsMap.get(note.id) ?? []).length > 0 ? threadColorsMap.get(note.id) : undefined,
    }));
  } catch (error) {
    console.error("Error fetching unorganized notes:", error);
    return [];
  }
}

export async function getAssignedNotesForDashboard(userId: string, limit = 10) {
  try {
    const unorganizedThread = await findUnorganizedThread(userId);
    const whereClause = unorganizedThread
      ? and(eq(Notes.userId, userId), ne(Notes.threadId, unorganizedThread.id))
      : eq(Notes.userId, userId);

    const notes = await db.select(NOTE_SELECT_COLUMNS)
      .from(Notes).where(whereClause)
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(limit).all();

    const noteIds = notes.map(n => n.id).filter(Boolean) as string[];
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    return notes.map(note => ({
      ...note,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
      threadColors: (threadColorsMap.get(note.id) ?? []).length > 0 ? threadColorsMap.get(note.id) : undefined,
    }));
  } catch (error) {
    console.error("Error fetching assigned notes:", error);
    return [];
  }
}

// ─── Content items (main dashboard list) ────────────────────────────────────────

export async function getContentItems(userId: string, limit = 20, offset = 0, filterExcludeReferencedScripture = false, threads?: any[]) {
  try {
    const fetchLimit = limit + offset;
    const threadLimit = Math.min(fetchLimit + 50, 500);
    const [threadsData, assignedNotesRaw, unorganizedNotesRaw] = await Promise.all([
      threads && Array.isArray(threads) ? Promise.resolve(threads) : getThreadsWithCountsLimited(userId, threadLimit),
      getAssignedNotesForDashboard(userId, fetchLimit),
      getUnorganizedNotesForDashboard(userId, fetchLimit),
    ]);

    const threadsToUse = Array.isArray(threadsData) ? threadsData : [];
    let assignedNotes = assignedNotesRaw;
    let unorganizedNotes = unorganizedNotesRaw;

    const threadItems = threadsToUse.map(thread => ({
      id: thread.id, type: "thread" as const, title: thread.title,
      subtitle: `${thread.noteCount} notes`, count: thread.noteCount,
      threadId: thread.id, spaceId: thread.spaceId,
      lastUpdated: thread.lastUpdated, updatedAt: thread.updatedAt || thread.createdAt,
      lastVisited: thread.lastVisited || null, createdAt: thread.createdAt,
      isPrivate: !thread.isPublic, accentColor: thread.accentColor, color: thread.color,
    }));

    // Fetch resource metadata
    const resourceNoteIds = [...assignedNotes, ...unorganizedNotes].filter(n => n.noteType === 'resource').map(n => n.id);
    let resourceMetadataMap: Record<string, any> = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc: any, meta) => { acc[meta.noteId] = meta; return acc; }, {});
      } catch (_) { /* continue */ }
    }

    // Fetch scripture references
    let scriptureReferencesMap: Record<string, Array<{ reference: string; noteId: string; threadColors?: Array<{ color: string; frequency: number }> }>> = {};
    const defaultNoteIds = [...assignedNotes, ...unorganizedNotes]
      .filter(n => n.noteType === 'default' || !n.noteType).map(n => n.id);

    if (defaultNoteIds.length > 0) {
      try {
        const junctionEntries = await db.select({
          noteId: NoteScriptureReferences.noteId,
          scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
        })
        .from(NoteScriptureReferences)
        .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
        .where(and(inArray(NoteScriptureReferences.noteId, defaultNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
        .all();

        const scriptureNoteIds = [...new Set(junctionEntries.map(e => e.scriptureNoteId))];
        let scriptureMetadataMap: Record<string, string> = {};
        if (scriptureNoteIds.length > 0) {
          const sm = await db.select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds)).all();
          scriptureMetadataMap = sm.reduce((acc: any, m) => { acc[m.noteId] = m.reference; return acc; }, {});
        }

        const scriptureNoteIdsArray = scriptureNoteIds.filter(Boolean) as string[];
        const scriptureThreadColorsBatchMap = scriptureNoteIdsArray.length > 0
          ? await getThreadColorsForNotesBatch(scriptureNoteIdsArray, userId)
          : new Map<string, Array<{ color: string; frequency: number }>>();

        for (const entry of junctionEntries) {
          const reference = scriptureMetadataMap[entry.scriptureNoteId];
          if (reference) {
            if (!scriptureReferencesMap[entry.noteId]) scriptureReferencesMap[entry.noteId] = [];
            if (!scriptureReferencesMap[entry.noteId].some(r => r.noteId === entry.scriptureNoteId)) {
              scriptureReferencesMap[entry.noteId].push({
                reference, noteId: entry.scriptureNoteId,
                threadColors: scriptureThreadColorsBatchMap.get(entry.scriptureNoteId) ?? undefined,
              });
            }
          }
        }

        if (filterExcludeReferencedScripture) {
          const referencedScriptureNoteIds = new Set(junctionEntries.map(e => e.scriptureNoteId));
          assignedNotes = assignedNotes.filter(note => {
            if (note.noteType !== 'scripture') return true;
            if (!referencedScriptureNoteIds.has(note.id)) return true;
            return note.lastVisited != null;
          });
          unorganizedNotes = unorganizedNotes.filter(note => {
            if (note.noteType !== 'scripture') return true;
            if (!referencedScriptureNoteIds.has(note.id)) return true;
            return note.lastVisited != null;
          });
        }
      } catch (error) {
        console.error('Error fetching scripture references:', error);
      }
    }

    const mapNote = (note: any) => {
      const cleanContent = stripHtml(note.content);
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const isEncrypted = note.contentEncrypted === true;
      return {
        id: note.id, type: "note" as const,
        title: resourceMeta?.sourceTitle || note.title || "Untitled Note",
        content: isEncrypted ? "" : (resourceMeta?.sourceDescription || cleanContent).substring(0, 150) + ((resourceMeta?.sourceDescription || cleanContent).length > 150 ? "..." : ""),
        contentEncrypted: isEncrypted, noteId: note.id, threadId: note.threadId, spaceId: note.spaceId,
        noteType: note.noteType || 'default', lastUpdated: note.lastUpdated,
        updatedAt: note.updatedAt || note.createdAt, lastVisited: note.lastVisited || null, createdAt: note.createdAt,
        resourceTitle: resourceMeta?.sourceTitle || null, resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null, threadColors: note.threadColors,
        scriptureReferences: scriptureReferencesMap[note.id] || undefined,
      };
    };

    const allItemsMap = new Map<string, any>();
    threadItems.forEach(item => allItemsMap.set(item.id, item));
    assignedNotes.map(mapNote).forEach(item => { if (!allItemsMap.has(item.id)) allItemsMap.set(item.id, item); });
    unorganizedNotes.map(mapNote).forEach(item => { if (!allItemsMap.has(item.id)) allItemsMap.set(item.id, item); });

    return sortByLastVisited(Array.from(allItemsMap.values())).slice(offset, offset + limit);
  } catch (error) {
    console.error("Error fetching content items:", error);
    return [];
  }
}

// ─── Scripture note helpers ─────────────────────────────────────────────────────

export async function getReferencedScriptureNotesWithoutLastVisited(userId: string): Promise<any[]> {
  try {
    const junctionEntries = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
      .where(and(eq(Notes.userId, userId), eq(Notes.noteType, 'scripture'))).all();

    const referencedIds = [...new Set(junctionEntries.map(e => e.scriptureNoteId))];
    if (referencedIds.length === 0) return [];

    const notes = await db.select(NOTE_SELECT_COLUMNS)
      .from(Notes)
      .where(and(inArray(Notes.id, referencedIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture'), isNull(Notes.lastVisited)))
      .all();

    if (notes.length === 0) return [];

    const noteIds = notes.map(n => n.id);
    const threadColorsMap = await getThreadColorsForNotesAsRecord(noteIds, userId);

    return notes.map(note => {
      const cleanContent = stripHtml(note.content);
      return {
        id: note.id, type: "note" as const, title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        noteId: note.id, threadId: note.threadId, spaceId: note.spaceId,
        noteType: note.noteType || 'scripture',
        lastUpdated: note.updatedAt || note.createdAt, updatedAt: note.updatedAt || note.createdAt,
        lastVisited: null, createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || undefined,
      };
    });
  } catch (error) {
    console.error("Error fetching referenced scripture notes without lastVisited:", error);
    return [];
  }
}

export async function getScriptureNotesForDashboard(userId: string, limit = 20, offset = 0): Promise<{ items: any[]; hasMore: boolean }> {
  try {
    const fetchLimit = limit + 1;
    const notes = await db.select(NOTE_SELECT_COLUMNS)
      .from(Notes)
      .where(and(eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(fetchLimit).offset(offset).all();

    const sortedNotes = sortByLastVisited(notes.map(n => ({ ...n, updatedAt: n.updatedAt || n.createdAt, id: n.id || '' })));
    const limitedNotes = sortedNotes.slice(0, limit);

    const noteIds = limitedNotes.map(n => n.id);
    const threadColorsMap = await getThreadColorsForNotesAsRecord(noteIds, userId);

    const noteItems = limitedNotes.map(note => {
      const cleanContent = stripHtml(note.content);
      return {
        id: note.id, type: "note" as const, title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        noteId: note.id, threadId: note.threadId, spaceId: note.spaceId,
        noteType: note.noteType || 'scripture',
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        updatedAt: note.updatedAt || note.createdAt, lastVisited: note.lastVisited, createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || undefined,
      };
    });

    return { items: noteItems, hasMore: sortedNotes.length > limit };
  } catch (error) {
    console.error("Error fetching scripture notes:", error);
    return { items: [], hasMore: false };
  }
}

// ─── Space helpers ──────────────────────────────────────────────────────────────

export async function getThreadsForSpace(spaceId: string, userId: string) {
  try {
    const threads = await db.select({
      id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
      color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
      isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
    }).from(Threads)
      .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)))
      .orderBy(
        desc(Threads.isPinned),
        asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt), asc(Threads.id)
      ).all();

    const threadIds = threads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId)))
        .groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }

    return threads.map(thread => ({
      id: thread.id, title: thread.title, subtitle: thread.subtitle,
      color: thread.color, spaceId: thread.spaceId, userId: thread.userId,
      isPublic: thread.isPublic, isPinned: thread.isPinned, createdAt: thread.createdAt,
      updatedAt: thread.updatedAt, lastVisited: thread.lastVisited,
      noteCount: noteCountsMap.get(thread.id) || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    }));
  } catch (error) {
    console.error("Error fetching threads for space:", error);
    return [];
  }
}

export async function getThreadsForSpaceBySpaceId(spaceId: string) {
  try {
    const threads = await db.select({
      id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
      color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
      isPublic: Threads.isPublic, isPinned: Threads.isPinned,
      createdAt: Threads.createdAt, updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
    }).from(Threads).where(eq(Threads.spaceId, spaceId))
      .orderBy(
        desc(Threads.isPinned),
        asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt), asc(Threads.id)
      ).all();

    const threadIds = threads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).where(inArray(NoteThreads.threadId, threadIds))
        .groupBy(NoteThreads.threadId).all();
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }

    return threads.map(thread => ({
      id: thread.id, title: thread.title, subtitle: thread.subtitle,
      color: thread.color, spaceId: thread.spaceId, userId: thread.userId,
      isPublic: thread.isPublic, isPinned: thread.isPinned,
      createdAt: thread.createdAt, updatedAt: thread.updatedAt, lastVisited: thread.lastVisited,
      noteCount: noteCountsMap.get(thread.id) || 0,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    }));
  } catch (error) {
    console.error("Error fetching threads for space by spaceId:", error);
    return [];
  }
}

export async function getNotesForSpace(spaceId: string, userId: string, limit = 20, offset = 0) {
  try {
    const fetchLimit = limit + offset + 1;
    const allNotes = await db.select({ ...NOTE_SELECT_COLUMNS, userId: Notes.userId })
      .from(Notes).where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, userId)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(fetchLimit).all();

    const sortedAllNotes = sortByLastVisited(allNotes.map(note => ({
      ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || ''
    })));
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    let resourceMetadataMap: Record<string, any> = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc: any, meta) => {
          acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
          return acc;
        }, {});
      } catch (_) {}
    }

    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);

    const notesWithMeta = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

    return { notes: notesWithMeta, hasMore };
  } catch (error) {
    console.error("Error fetching notes for space:", error);
    return { notes: [], hasMore: false };
  }
}

export async function getNotesForSpaceForMember(
  spaceId: string,
  ownerUserId: string,
  limit = 100,
  offset = 0
): Promise<{ notes: any[]; hasMore: boolean }> {
  try {
    const fetchLimit = limit + offset + 1;
    const allNotes = await db.select({
      ...NOTE_SELECT_COLUMNS,
      userId: Notes.userId,
    }).from(Notes)
      .where(and(eq(Notes.spaceId, spaceId), eq(Notes.contentEncrypted, false)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(fetchLimit).all();

    const sortedAllNotes = sortByLastVisited(allNotes.map(note => ({
      ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || ''
    })));
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    let resourceMetadataMap: Record<string, any> = {};
    if (resourceNoteIds.length > 0) {
      try {
        const rm = await db.select({
          noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
        resourceMetadataMap = rm.reduce((acc: any, meta) => {
          acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
          return acc;
        }, {});
      } catch (_) {}
    }

    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, ownerUserId);

    const notesWithMeta = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

    return { notes: notesWithMeta, hasMore };
  } catch (error) {
    console.error("Error fetching notes for space (member view):", error);
    return { notes: [], hasMore: false };
  }
}
