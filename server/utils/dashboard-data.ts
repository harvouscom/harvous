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
  db, first, Threads, Notes, Spaces, SpaceNotes, NoteThreads, SpaceMemberships, UserMetadata,
  Churches, NoteScriptureReferences, ScriptureMetadata, ResourceMetadata, Tags, NoteTags,
  eq, and, desc, asc, count, ne, isNull, isNotNull, inArray, sql,
} from '../db';
import { nowISO } from '../db/dates';
import { getThreadColorCSS, getThreadGradientCSS } from "@/utils/colors";
import { getInboxCount as getInboxCountUtil } from "./inbox-data";
import { sortByLastVisited, sortByCreatedAtAsc, sortOnboardingThreadNotes, sortNotesByLastVisited, sortNotesByLastUpdated } from "@/utils/sorting";
import { isOnboardingThread } from "@/utils/last-visited-sections";
import { stripHtmlForCard } from "@/utils/html-stripper";
import { MY_PILE_THREAD_TITLE } from "@/utils/my-pile-thread";
import { parseNoteSecondaryCollections } from './note-secondary-collections';
import {
  NOT_ONBOARDING_NOTES_THREAD,
  NOT_ONBOARDING_SYSTEM_NOTES,
  NOT_ONBOARDING_THREADS,
} from './purge-onboarding-content';
import { serializeSharedCanonicalNote } from './shared-note-serializer';
import { requireThreadReadAccess } from './shared-space-lifecycle';
import { hasStoredThreadOrder, sortNotesBySequence } from './thread-sequence';

/**
 * Ceiling on how many steps a sequence Thread pages in memory. A study plan is
 * tens of steps; this is a guard against a pathological Thread, not a limit
 * anyone should meet.
 */
const SEQUENCE_THREAD_FETCH_CAP = 500;

export type AuthorAttribution = {
  displayName: string;
  userColor: string;
  firstName: string | null;
  profileImageUrl: string | null;
};

type ChurchNavFields = {
  churchName?: string | null;
  churchCity?: string | null;
  churchState?: string | null;
};

/** Attach Churches name + location for org-owned spaces (ministry / church-scoped). */
async function attachChurchNamesToSpaces<T extends { orgId?: string | null }>(
  spaces: T[],
): Promise<Array<T & ChurchNavFields>> {
  const orgIds = [
    ...new Set(spaces.map((space) => space.orgId).filter((id): id is string => Boolean(id))),
  ];
  if (orgIds.length === 0) {
    return spaces.map((space) => ({
      ...space,
      churchName: null,
      churchCity: null,
      churchState: null,
    }));
  }
  try {
    const churches = await db
      .select({
        orgId: Churches.orgId,
        name: Churches.name,
        city: Churches.city,
        state: Churches.state,
      })
      .from(Churches)
      .where(and(inArray(Churches.orgId, orgIds), eq(Churches.isActive, true), isNull(Churches.deletedAt)));
    const byOrg = new Map(
      churches.map((church) => [
        church.orgId,
        {
          churchName: church.name,
          churchCity: church.city ?? null,
          churchState: church.state ?? null,
        },
      ]),
    );
    return spaces.map((space) => {
      const meta = space.orgId ? byOrg.get(space.orgId) : undefined;
      return {
        ...space,
        churchName: meta?.churchName ?? null,
        churchCity: meta?.churchCity ?? null,
        churchState: meta?.churchState ?? null,
      };
    });
  } catch (error) {
    console.error('Error attaching church names to spaces:', error);
    return spaces.map((space) => ({
      ...space,
      churchName: null,
      churchCity: null,
      churchState: null,
    }));
  }
}

/** Batched UserMetadata lookup for shared-space author chips (notes, highlights). */
export async function batchAuthorAttribution(
  userIds: string[],
): Promise<Record<string, AuthorAttribution>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  try {
    const rows = await db
      .select({
        userId: UserMetadata.userId,
        firstName: UserMetadata.firstName,
        lastName: UserMetadata.lastName,
        userColor: UserMetadata.userColor,
        profileImageUrl: UserMetadata.profileImageUrl,
      })
      .from(UserMetadata)
      .where(inArray(UserMetadata.userId, unique));
    return rows.reduce(
      (acc, row) => {
        const firstName = row.firstName || '';
        const lastInitial = row.lastName ? row.lastName.charAt(0).toUpperCase() : '';
        acc[row.userId] = {
          displayName: firstName
            ? lastInitial
              ? `${firstName} ${lastInitial}.`
              : firstName
            : 'A Harvous User',
          userColor: row.userColor || 'blue',
          firstName: row.firstName || null,
          profileImageUrl: row.profileImageUrl || null,
        };
        return acc;
      },
      {} as Record<string, AuthorAttribution>,
    );
  } catch {
    return {};
  }
}

// ─── Private helpers ────────────────────────────────────────────────────────────

/** Public/shared spaces list notes and threads oldest-first (curated series). */
async function spaceUsesChronologicalOrdering(spaceId: string): Promise<boolean> {
  const row = first(
    await db.select({ isPublic: Spaces.isPublic }).from(Spaces).where(eq(Spaces.id, spaceId)).limit(1),
  );
  return row?.isPublic === true;
}

const SCRIPTURE_TRANSLATION_ATTR_RE = /data-scripture-translation\s*=\s*["']([^"']+)["']/i;

function extractScriptureTranslationFromNoteContent(content: string | null | undefined): string | undefined {
  if (!content) return undefined;
  const match = content.match(SCRIPTURE_TRANSLATION_ATTR_RE);
  if (!match) return undefined;
  const parsed = match[1]?.trim();
  if (!parsed) return undefined;
  return parsed.toUpperCase();
}

/**
 * Owner thread lists may include personal-space and null-space Threads, but
 * must not surface metadata from soft-deleted shared/public spaces.
 */
export function activeOwnerThreadSpacePredicate() {
  return sql`(
    ${Threads.spaceId} IS NULL
    OR EXISTS (
      SELECT 1
      FROM ${Spaces}
      WHERE ${Spaces.id} = ${Threads.spaceId}
        AND (${Spaces.type} = 'personal' OR ${Spaces.deletedAt} IS NULL)
    )
  )`;
}

/**
 * Find (or create) the My Pile thread (`thread_unorganized`) for a user.
 */
async function findUnorganizedThread(userId: string) {
  const selectFields = {
    id: Threads.id,
    title: Threads.title,
    subtitle: Threads.subtitle,
    color: Threads.color,
    spaceId: Threads.spaceId,
    isPublic: Threads.isPublic,
    isPinned: Threads.isPinned,
    createdAt: Threads.createdAt,
    updatedAt: Threads.updatedAt,
  };

  try {
    // thread_unorganized is a global sentinel — look it up without userId filter
    // so any user finds the existing row rather than trying to re-create it
    const existing = first(
      await db.select(selectFields)
        .from(Threads)
        .where(eq(Threads.id, "thread_unorganized"))
        .limit(1)
    );
    if (existing) {
      if (existing.title !== MY_PILE_THREAD_TITLE) {
        await db.update(Threads)
          .set({ title: MY_PILE_THREAD_TITLE, updatedAt: nowISO() })
          .where(eq(Threads.id, 'thread_unorganized'));
        const refreshed = first(
          await db.select(selectFields)
            .from(Threads)
            .where(eq(Threads.id, "thread_unorganized"))
            .limit(1),
        );
        if (refreshed) return refreshed;
      }
      return existing;
    }

    // Row doesn't exist yet — insert, silently ignoring a concurrent insert race
    await db.insert(Threads).values({
      id: "thread_unorganized",
      title: MY_PILE_THREAD_TITLE,
      subtitle: "Notes that haven't been organized into threads yet",
      spaceId: null,
      userId: userId,
      isPublic: true,
      isPinned: false,
      color: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }).onConflictDoNothing();

    return first(
      await db.select(selectFields)
        .from(Threads)
        .where(eq(Threads.id, "thread_unorganized"))
        .limit(1)
    ) ?? null;
  } catch (error) {
    console.error("Error finding/creating unorganized thread:", error);
    return null;
  }
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
      ne(Threads.id, "thread_unorganized"),
      NOT_ONBOARDING_THREADS,
      activeOwnerThreadSpacePredicate(),
    ))
    .orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited),
      desc(Threads.updatedAt),
      desc(Threads.createdAt),
      asc(Threads.id)
    )
    ;

    const threadIds = threads.map(thread => thread.id);
    let noteCountsMap = new Map<string, number>();

    if (threadIds.length > 0) {
      // Count notes directly in each thread
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
      ;

      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));

      // Include notes assigned via threadId column when junction row is missing.
      const columnCounts = await db.select({
        threadId: Notes.threadId,
        count: count(),
      })
        .from(Notes)
        .leftJoin(
          NoteThreads,
          and(eq(NoteThreads.noteId, Notes.id), eq(NoteThreads.threadId, Notes.threadId)),
        )
        .where(and(
          eq(Notes.userId, userId),
          inArray(Notes.threadId, threadIds),
          isNull(NoteThreads.id),
        ))
        .groupBy(Notes.threadId);

      for (const row of columnCounts) {
        if (!row.threadId) continue;
        noteCountsMap.set(row.threadId, (noteCountsMap.get(row.threadId) || 0) + Number(row.count));
      }

      // Also count referenced scripture notes per thread (matching getNotesForThread behavior)
      // Get all note IDs per thread
      const threadNoteRows = await db.select({ threadId: NoteThreads.threadId, noteId: NoteThreads.noteId })
        .from(NoteThreads)
        .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId)));

      const allNoteIds = threadNoteRows.map(r => r.noteId).filter(Boolean) as string[];
      if (allNoteIds.length > 0) {
        const refs = await db.select({
          noteId: NoteScriptureReferences.noteId,
          scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
        })
          .from(NoteScriptureReferences)
          .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, allNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));

        // Build a map: noteId -> set of scripture note IDs it references
        const noteToRefs = new Map<string, Set<string>>();
        for (const ref of refs) {
          if (!noteToRefs.has(ref.noteId)) noteToRefs.set(ref.noteId, new Set());
          noteToRefs.get(ref.noteId)!.add(ref.scriptureNoteId);
        }

        // For each thread, count additional scripture notes not already in the thread
        for (const threadId of threadIds) {
          const threadNoteIds = new Set(threadNoteRows.filter(r => r.threadId === threadId).map(r => r.noteId));
          const additionalScriptureIds = new Set<string>();
          for (const noteId of threadNoteIds) {
            const scriptureRefs = noteToRefs.get(noteId as string);
            if (scriptureRefs) {
              for (const sid of scriptureRefs) {
                if (!threadNoteIds.has(sid)) additionalScriptureIds.add(sid);
              }
            }
          }
          if (additionalScriptureIds.size > 0) {
            const currentCount = noteCountsMap.get(threadId) || 0;
            noteCountsMap.set(threadId, currentCount + additionalScriptureIds.size);
          }
        }
      }
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
    const [
      spacesWithThreadCounts,
      standaloneNoteCounts,
      totalNoteCounts,
      authoredNoteCountRow,
      sharedNoteCounts,
    ] = await Promise.all([
      db.select({
        id: Spaces.id, title: Spaces.title, description: Spaces.description,
        publishCadence: Spaces.publishCadence,
        color: Spaces.color, backgroundGradient: Spaces.backgroundGradient,
        coverBgLight: Spaces.coverBgLight, coverBgDark: Spaces.coverBgDark,
        isPublic: Spaces.isPublic, isActive: Spaces.isActive, type: Spaces.type,
        orgId: Spaces.orgId,
        meetingDay: Spaces.meetingDay, meetingTime: Spaces.meetingTime,
        meetingKind: Spaces.meetingKind, meetingUrl: Spaces.meetingUrl,
        studyPlanningMode: Spaces.studyPlanningMode,
        createdAt: Spaces.createdAt, updatedAt: Spaces.updatedAt,
        lastVisited: Spaces.lastVisited,
        threadCount: count(Threads.id),
      })
      .from(Spaces)
      .leftJoin(Threads, eq(Spaces.id, Threads.spaceId))
      .where(and(eq(Spaces.userId, userId), isNull(Spaces.deletedAt)))
      .groupBy(Spaces.id)
      .orderBy(
        desc(Spaces.isActive),
        asc(sql`CASE WHEN ${Spaces.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Spaces.lastVisited),
        desc(Spaces.updatedAt),
        desc(Spaces.createdAt)
      )
      ,

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
      ,

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
      ,
      db.select({ totalNoteCount: count(Notes.id) })
        .from(Notes)
        .where(eq(Notes.userId, userId))
        .then((rows) => first(rows)),
      db.select({ spaceId: SpaceNotes.spaceId, totalNoteCount: count(SpaceNotes.noteId) })
        .from(SpaceNotes)
        .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
        .where(and(isNull(SpaceNotes.removedAt), eq(Notes.contentEncrypted, false)))
        .groupBy(SpaceNotes.spaceId),
    ]);

    const standaloneCountMap = new Map(standaloneNoteCounts.map(item => [item.spaceId, item.standaloneNoteCount]));
    const totalCountMap = new Map(totalNoteCounts.map(item => [item.spaceId, item.totalNoteCount]));
    const sharedCountMap = new Map(sharedNoteCounts.map((item) => [item.spaceId, item.totalNoteCount]));
    for (const space of spacesWithThreadCounts) {
      if (space.type !== 'shared' && space.type !== 'public') continue;
      const associationCount = sharedCountMap.get(space.id) ?? 0;
      totalCountMap.set(space.id, associationCount);
      standaloneCountMap.set(space.id, associationCount);
    }
    const myHome = spacesWithThreadCounts.find(
      (space) =>
        space.type === 'personal' &&
        space.title.trim().toLowerCase() === 'my home',
    );
    if (myHome) totalCountMap.set(myHome.id, authoredNoteCountRow?.totalNoteCount ?? 0);

    const mapped = spacesWithThreadCounts.map(space => ({
      id: space.id, title: space.title, description: space.description,
      publishCadence: space.publishCadence ?? null,
      color: space.color, backgroundGradient: space.backgroundGradient,
      // Prefetch owner path reads these — dropping them made saved cover variants
      // fall back to family variant 1 after refresh.
      coverBgLight: space.coverBgLight ?? null,
      coverBgDark: space.coverBgDark ?? null,
      isPublic: space.isPublic, isActive: space.isActive, type: space.type,
      orgId: space.orgId ?? null,
      // Prefetch owner path reads these too — same reason as the covers above.
      meetingDay: space.meetingDay ?? null,
      meetingTime: space.meetingTime ?? null,
      meetingKind: space.meetingKind ?? null,
      meetingUrl: space.meetingUrl ?? null,
      /* And this one — the hub's "What's next" row reads it off the prefetch
         payload, so a room with suggestions on would show no row until the
         slower bootstrap answered. */
      studyPlanningMode: space.studyPlanningMode ?? 'off',
      createdAt: space.createdAt, updatedAt: space.updatedAt,
      lastVisited: space.lastVisited,
      threadCount: space.threadCount || 0,
      standaloneNoteCount: standaloneCountMap.get(space.id) || 0,
      totalItemCount: (space.threadCount || 0) + (totalCountMap.get(space.id) || 0),
      totalNoteCount: totalCountMap.get(space.id) || 0,
      lastUpdated: space.lastVisited || space.updatedAt || space.createdAt,
    }));
    return attachChurchNamesToSpaces(mapped);
  } catch (error) {
    console.error("Error fetching spaces:", error);
    return [];
  }
}

export async function getMemberOfSpaces(userId: string): Promise<Array<{
  id: string;
  title: string | null;
  color: string | null;
  type: string;
  role: string;
  memberCount: number;
  totalItemCount: number;
  orgId?: string | null;
  churchName?: string | null;
  publishCadence?: string | null;
}>> {
  try {
    // Single JOIN to get all shared/public spaces the user belongs to but does not own.
    const spaceRows = await db
      .select({
        id: Spaces.id,
        title: Spaces.title,
        color: Spaces.color,
        type: Spaces.type,
        orgId: Spaces.orgId,
        publishCadence: Spaces.publishCadence,
        role: SpaceMemberships.role,
      })
      .from(SpaceMemberships)
      .innerJoin(Spaces, eq(SpaceMemberships.spaceId, Spaces.id))
      .where(and(eq(SpaceMemberships.userId, userId), ne(Spaces.userId, userId), isNull(Spaces.deletedAt)));

    if (spaceRows.length === 0) return [];

    const spaceIds = spaceRows.map(r => r.id);

    // Three aggregation queries instead of 2N individual queries
    const [memberCounts, threadCounts, noteCounts] = await Promise.all([
      db.select({ spaceId: SpaceMemberships.spaceId, cnt: count() })
        .from(SpaceMemberships)
        .where(inArray(SpaceMemberships.spaceId, spaceIds))
        .groupBy(SpaceMemberships.spaceId),
      db.select({ spaceId: Threads.spaceId, cnt: count() })
        .from(Threads)
        .where(and(isNotNull(Threads.spaceId), inArray(Threads.spaceId, spaceIds)))
        .groupBy(Threads.spaceId),
      db.select({ spaceId: SpaceNotes.spaceId, cnt: count() })
        .from(SpaceNotes)
        .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
        .where(and(
          inArray(SpaceNotes.spaceId, spaceIds),
          isNull(SpaceNotes.removedAt),
          eq(Notes.contentEncrypted, false),
        ))
        .groupBy(SpaceNotes.spaceId),
    ]);

    const memberCountMap = new Map(memberCounts.map(r => [r.spaceId, r.cnt]));
    const threadCountMap = new Map(threadCounts.map(r => [r.spaceId!, r.cnt]));
    const noteCountMap = new Map(noteCounts.map(r => [r.spaceId!, r.cnt]));

    const mapped = spaceRows.map(space => ({
      id: space.id,
      title: space.title,
      color: space.color,
      type: space.type,
      orgId: space.orgId ?? null,
      publishCadence: space.publishCadence ?? null,
      role: space.role,
      memberCount: memberCountMap.get(space.id) || 0,
      totalItemCount: (threadCountMap.get(space.id) || 0) + (noteCountMap.get(space.id) || 0),
    }));
    return attachChurchNamesToSpaces(mapped);
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
    const thread = first(await db.select({
      id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
      color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
      isPublic: Threads.isPublic, isPinned: Threads.isPinned,
      createdAt: Threads.createdAt, updatedAt: Threads.updatedAt,
      lastVisited: Threads.lastVisited,
    })
    .from(Threads)
    .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId), activeOwnerThreadSpacePredicate()))
    .limit(1));

    if (!thread) return null;

    // Count notes directly in thread (junction + threadId column fallback)
    const threadNotes = await db.select({ id: Notes.id })
      .from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)));

    const columnOnlyNotes = await db.select({ id: Notes.id })
      .from(Notes)
      .leftJoin(
        NoteThreads,
        and(eq(NoteThreads.noteId, Notes.id), eq(NoteThreads.threadId, threadId)),
      )
      .where(and(eq(Notes.userId, userId), eq(Notes.threadId, threadId), isNull(NoteThreads.id)));

    const mergedThreadNotes = [...threadNotes, ...columnOnlyNotes];
    const uniqueThreadNoteIds = [...new Set(mergedThreadNotes.map((n) => n.id).filter(Boolean))] as string[];

    // Also count referenced scripture notes (matching getNotesForThread behavior)
    const threadNoteIds = uniqueThreadNoteIds;
    let referencedScriptureCount = 0;
    if (threadNoteIds.length > 0) {
      const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
        .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
        .where(and(inArray(NoteScriptureReferences.noteId, threadNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
      const alreadyIds = new Set(threadNoteIds);
      const additionalIds = new Set(refs.map(r => r.scriptureNoteId).filter(id => !alreadyIds.has(id)));
      referencedScriptureCount = additionalIds.size;
    }

    const noteCount = uniqueThreadNoteIds.length + referencedScriptureCount;

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
    .where(and(
      eq(Threads.userId, userId),
      ne(Threads.id, "thread_unorganized"),
      NOT_ONBOARDING_THREADS,
      activeOwnerThreadSpacePredicate(),
    ))
    .orderBy(
      desc(Threads.isPinned),
      asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt), asc(Threads.id)
    );
    const threads = limit != null ? await baseQuery.limit(limit) : await baseQuery;

    const threadIds = threads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      // Get direct junction note counts
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId)))
        .groupBy(NoteThreads.threadId);
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));

      // Add referenced scripture notes to counts (matches getThreadNoteTypeCounts logic).
      // Batched: one query for all (threadId, noteId) pairs, one query for all scripture
      // refs, then computed in memory — avoids the previous O(threads) N+1 loop.
      const threadNoteRows = await db.select({ threadId: NoteThreads.threadId, noteId: NoteThreads.noteId })
        .from(NoteThreads)
        .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId)));

      const allNoteIds = threadNoteRows.map(r => r.noteId).filter(Boolean) as string[];
      if (allNoteIds.length > 0) {
        const refs = await db.select({
          noteId: NoteScriptureReferences.noteId,
          scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
        })
          .from(NoteScriptureReferences)
          .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, allNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));

        const noteToRefs = new Map<string, Set<string>>();
        for (const ref of refs) {
          if (!noteToRefs.has(ref.noteId)) noteToRefs.set(ref.noteId, new Set());
          noteToRefs.get(ref.noteId)!.add(ref.scriptureNoteId);
        }

        for (const threadId of threadIds) {
          const threadNoteIds = new Set(threadNoteRows.filter(r => r.threadId === threadId).map(r => r.noteId));
          const additionalScriptureIds = new Set<string>();
          for (const noteId of threadNoteIds) {
            const scriptureRefs = noteToRefs.get(noteId as string);
            if (scriptureRefs) {
              for (const sid of scriptureRefs) {
                if (!threadNoteIds.has(sid)) additionalScriptureIds.add(sid);
              }
            }
          }
          if (additionalScriptureIds.size > 0) {
            noteCountsMap.set(threadId, (noteCountsMap.get(threadId) || 0) + additionalScriptureIds.size);
          }
        }
      }
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

// ─── Shared-space membership counts ─────────────────────────────────────────────

/**
 * How many live shared spaces / channels each note is published to.
 *
 * My Home list rows carry no membership signal today, so a note you've shared
 * looks identical to a private one — the list stays silent while the editor shows
 * full co-editing chrome. This is the quiet indicator that closes that gap.
 *
 * Scoped to spaces the viewer still belongs to, so a membership you've lost never
 * inflates the count. Served by `SpaceNotes_noteId_removedAtIndex`.
 */
export async function getSharedSpaceCountsForNotesBatch(
  noteIds: string[], userId: string
): Promise<Map<string, number>> {
  if (noteIds.length === 0) return new Map();
  try {
    const rows = await db.select({ noteId: SpaceNotes.noteId })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(SpaceNotes.spaceId, Spaces.id))
      .innerJoin(
        SpaceMemberships,
        and(eq(SpaceMemberships.spaceId, Spaces.id), eq(SpaceMemberships.userId, userId)),
      )
      .where(and(
        inArray(SpaceNotes.noteId, noteIds),
        isNull(SpaceNotes.removedAt),
        isNull(Spaces.deletedAt),
        inArray(Spaces.type, ['shared', 'public']),
      ));

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.noteId, (counts.get(row.noteId) ?? 0) + 1);
    }
    return counts;
  } catch (_) {
    // Never fail a notes list over a decorative count.
    return new Map();
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
    ;

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

/** Cap per note so the list payload stays lean — the list already truncates note content. */
const NOTE_LIST_MAX_TAGS = 12;

/**
 * Tag names per note for offline/local list filtering (sidebar search parity with native).
 *
 * Scoped to `userId`'s own tags — `Tags` are per-user, so in a shared space a viewer
 * sees only the tags they applied themselves, never another member's private labels.
 */
export async function getTagNamesForNotesBatch(
  noteIds: string[], userId: string
): Promise<Map<string, string[]>> {
  if (noteIds.length === 0) return new Map();
  try {
    const rows = await db.select({ noteId: NoteTags.noteId, name: Tags.name })
      .from(NoteTags)
      .innerJoin(Tags, eq(Tags.id, NoteTags.tagId))
      .where(and(inArray(NoteTags.noteId, noteIds), eq(Tags.userId, userId)));

    const result = new Map<string, string[]>();
    for (const row of rows) {
      const name = row.name?.trim();
      if (!name) continue;
      const existing = result.get(row.noteId);
      if (!existing) {
        result.set(row.noteId, [name]);
      } else if (existing.length < NOTE_LIST_MAX_TAGS && !existing.includes(name)) {
        existing.push(name);
      }
    }
    return result;
  } catch (error) {
    console.error("Error batch fetching tag names for notes:", error);
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
      const unorganizedNotes = await db.select({ id: Notes.id, noteType: Notes.noteType })
        .from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(Notes.userId, userId), isNull(NoteThreads.id)));

      // Also include referenced scripture notes (matching getNotesForThread behavior)
      const unorganizedNoteIds = unorganizedNotes.map(n => n.id).filter(Boolean) as string[];
      let referencedScriptureNotes: typeof unorganizedNotes = [];
      if (unorganizedNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, unorganizedNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
        const alreadyIds = new Set(unorganizedNotes.filter(n => n.noteType === 'scripture').map(n => n.id));
        const additionalIds = [...new Set(refs.map(r => r.scriptureNoteId))].filter(id => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select({ id: Notes.id, noteType: Notes.noteType })
            .from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
        }
      }

      const notesMap = new Map<string, { id: string | null; noteType: string | null }>();
      [...unorganizedNotes, ...referencedScriptureNotes].forEach(n => { if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n); });
      let allNotes = Array.from(notesMap.values());

      // Filter out scripture notes whose parent is in a real thread
      const scriptureIds = allNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter(Boolean) as string[];
      let organizedScriptureIds = new Set<string>();
      if (scriptureIds.length > 0) {
        const rows = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences)
          .innerJoin(NoteThreads, eq(NoteThreads.noteId, NoteScriptureReferences.noteId))
          .where(inArray(NoteScriptureReferences.scriptureNoteId, scriptureIds));
        organizedScriptureIds = new Set(rows.map(r => r.scriptureNoteId));
      }
      allNotes = allNotes.filter(n => n.noteType !== 'scripture' || !organizedScriptureIds.has(n.id ?? ''));

      allCount = allNotes.length;
      defaultCount = allNotes.filter(n => !n.noteType || n.noteType === 'default').length;
      scriptureCount = allNotes.filter(n => n.noteType === 'scripture').length;
      resourceCount = allNotes.filter(n => n.noteType === 'resource').length;
    } else {
      const threadContext = first(
        await db
          .select({ spaceId: Threads.spaceId })
          .from(Threads)
          .where(eq(Threads.id, threadId))
          .limit(1),
      );
      if (threadContext?.spaceId) {
        const sharedNotes = await db
          .select({ id: Notes.id, noteType: Notes.noteType })
          .from(NoteThreads)
          .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
          .innerJoin(
            SpaceNotes,
            and(
              eq(SpaceNotes.noteId, Notes.id),
              eq(SpaceNotes.spaceId, threadContext.spaceId),
              isNull(SpaceNotes.removedAt),
            ),
          )
          .where(
            and(
              eq(NoteThreads.threadId, threadId),
              eq(Notes.contentEncrypted, false),
            ),
          );
        const uniqueSharedNotes = [
          ...new Map(sharedNotes.map((note) => [note.id, note])).values(),
        ];
        return {
          all: uniqueSharedNotes.length,
          default: uniqueSharedNotes.filter((note) => !note.noteType || note.noteType === 'default').length,
          scripture: uniqueSharedNotes.filter((note) => note.noteType === 'scripture').length,
          resource: uniqueSharedNotes.filter((note) => note.noteType === 'resource').length,
        };
      }
      const threadNotes = await db.select({ id: Notes.id, noteType: Notes.noteType })
        .from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)));

      const columnOnlyThreadNotes = await db.select({ id: Notes.id, noteType: Notes.noteType })
        .from(Notes)
        .leftJoin(
          NoteThreads,
          and(eq(NoteThreads.noteId, Notes.id), eq(NoteThreads.threadId, threadId)),
        )
        .where(and(eq(Notes.userId, userId), eq(Notes.threadId, threadId), isNull(NoteThreads.id)));

      // Also include referenced scripture notes (matching getNotesForThread behavior)
      const threadNoteIds = [...threadNotes, ...columnOnlyThreadNotes].map(n => n.id).filter(Boolean) as string[];
      let referencedScriptureNotes: typeof threadNotes = [];
      if (threadNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, threadNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
        const alreadyIds = new Set(threadNotes.filter(n => n.noteType === 'scripture').map(n => n.id));
        const additionalIds = [...new Set(refs.map(r => r.scriptureNoteId))].filter(id => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select({ id: Notes.id, noteType: Notes.noteType })
            .from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
        }
      }

      const notesMap = new Map<string, { id: string | null; noteType: string | null }>();
      [...threadNotes, ...columnOnlyThreadNotes, ...referencedScriptureNotes].forEach(n => {
        if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n);
      });
      const allNotes = Array.from(notesMap.values());

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
  isPinned: Notes.isPinned,
  createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, lastVisited: Notes.lastVisited,
  userId: Notes.userId,
  primaryCollection: Notes.primaryCollection,
  secondaryCollections: Notes.secondaryCollections,
  collectionPinned: Notes.collectionPinned,
  collectionUserOverride: Notes.collectionUserOverride,
} as const;

/**
 * Max characters of note HTML returned in *list* responses (thread/space note
 * lists, sidebar). List/preview surfaces only render a short stripped preview,
 * and the client always flags list content as a preview (useNote.ts
 * __contentIsPreview) and loads the full body on open via GET
 * /api/notes/:id/details. Kept generous enough to cover a card preview strip while
 * keeping list payloads small: at limit=100 a 20k cap meant up to ~2 MB of HTML
 * per bootstrap response, dominated by content the list never renders. Offline
 * reads are served from IndexedDB (sync bootstrap), unaffected by this cap.
 *
 * This cut is NOT harmless on its own: a client that resends a body read from a
 * list row overwrites the full note with this prefix. Writes are guarded by
 * isRawListPreviewWrite (src/utils/note-truncated-write-guard.ts), which reads
 * this exported constant — keep them in sync.
 */
export const NOTE_LIST_CONTENT_MAX_CHARS = 2000;

/**
 * List-payload column set: same as NOTE_SELECT_COLUMNS but content is truncated.
 *
 * `contentLength` is the *stored* length, so the client can tell "this preview is
 * the whole note" from "this preview is a prefix". Without it every list seed looks
 * identical and the editor can't know whether its body is safe to save.
 */
const NOTE_LIST_SELECT = {
  ...NOTE_SELECT_COLUMNS,
  content: sql<string>`left(${Notes.content}, ${NOTE_LIST_CONTENT_MAX_CHARS})`,
  contentLength: sql<number>`length(${Notes.content})`,
} as const;

/**
 * `orderedThread` carries the Thread's stored order when the caller already has
 * the row — the personal path never loads it otherwise, and a second query for
 * one JSON column on every thread open would be a poor trade. Absent, the list
 * falls back to recency, which is what an unarranged Thread has always done.
 */
export async function getNotesForThread(
  threadId: string,
  userId: string,
  limit = 20,
  offset = 0,
  orderedThread?: { sequenceNoteIds?: string | null } | null,
) {
  try {
    const arranged = Boolean(orderedThread && hasStoredThreadOrder(orderedThread));
    const fetchLimit = arranged ? SEQUENCE_THREAD_FETCH_CAP : limit + offset + 1;
    let allNotes: any[] = [];

    if (threadId === 'thread_unorganized') {
      const unorganizedNotes = await db.select(NOTE_LIST_SELECT)
        .from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(Notes.userId, userId), isNull(NoteThreads.id)))
        .orderBy(
          asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
          desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
        )
        .limit(fetchLimit);

      const unorganizedNoteIds = unorganizedNotes.map(n => n.id).filter(Boolean);
      let referencedScriptureNotes: typeof unorganizedNotes = [];
      if (unorganizedNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, unorganizedNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
          ;
        const uniqueIds = [...new Set(refs.map(r => r.scriptureNoteId))];
        const alreadyIds = new Set(unorganizedNotes.filter(n => n.noteType === 'scripture').map(n => n.id));
        const additionalIds = uniqueIds.filter(id => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select(NOTE_LIST_SELECT)
            .from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
        }
      }
      const notesMap = new Map<string, (typeof unorganizedNotes)[0]>();
      [...unorganizedNotes, ...referencedScriptureNotes].forEach(n => { if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n); });
      allNotes = Array.from(notesMap.values());

      // Filter out scripture notes whose parent is in a real thread
      const scriptureIds = allNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter(Boolean) as string[];
      let organizedScriptureIds = new Set<string>();
      if (scriptureIds.length > 0) {
        const rows = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences)
          .innerJoin(NoteThreads, eq(NoteThreads.noteId, NoteScriptureReferences.noteId))
          .where(inArray(NoteScriptureReferences.scriptureNoteId, scriptureIds));
        organizedScriptureIds = new Set(rows.map(r => r.scriptureNoteId));
      }
      allNotes = allNotes.filter(n => n.noteType !== 'scripture' || !organizedScriptureIds.has(n.id ?? ''));
    } else {
      const threadOrderBy = isOnboardingThread(threadId)
        ? [asc(Notes.simpleNoteId), asc(Notes.id)]
        : [
            asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
            desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id),
          ];
      const junctionNotes = await db.select(NOTE_LIST_SELECT)
        .from(Notes).innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)))
        .orderBy(...threadOrderBy)
        .limit(fetchLimit);

      // Fallback: notes with threadId column set but missing junction row (Classic desync).
      const columnOnlyNotes = await db.select(NOTE_LIST_SELECT)
        .from(Notes)
        .leftJoin(
          NoteThreads,
          and(eq(NoteThreads.noteId, Notes.id), eq(NoteThreads.threadId, threadId)),
        )
        .where(and(eq(Notes.userId, userId), eq(Notes.threadId, threadId), isNull(NoteThreads.id)))
        .orderBy(...threadOrderBy)
        .limit(fetchLimit);

      const threadNoteIds = [...junctionNotes, ...columnOnlyNotes].map(n => n.id).filter(Boolean);
      let referencedScriptureNotes: typeof junctionNotes = [];
      if (threadNoteIds.length > 0) {
        const refs = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(inArray(NoteScriptureReferences.noteId, threadNoteIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
          ;
        const uniqueIds = [...new Set(refs.map(r => r.scriptureNoteId))];
        const alreadyIds = new Set(junctionNotes.filter(n => n.noteType === 'scripture').map(n => n.id));
        const additionalIds = uniqueIds.filter(id => !alreadyIds.has(id));
        if (additionalIds.length > 0) {
          referencedScriptureNotes = await db.select(NOTE_LIST_SELECT)
            .from(Notes).where(and(inArray(Notes.id, additionalIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));
        }
      }
      const notesMap = new Map<string, (typeof junctionNotes)[0]>();
      [...junctionNotes, ...columnOnlyNotes, ...referencedScriptureNotes].forEach(n => {
        if (n.id && !notesMap.has(n.id)) notesMap.set(n.id, n);
      });
      allNotes = Array.from(notesMap.values());
    }

    const mappedNotes = allNotes.map(note => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || '' }));
    const sortedAllNotes = isOnboardingThread(threadId)
      ? sortOnboardingThreadNotes(mappedNotes)
      // An order someone arranged outranks recency — same rule as the member path.
      : arranged
        ? sortNotesBySequence(mappedNotes, orderedThread!)
        : sortByLastVisited(mappedNotes);

    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    // Fetch resource metadata, scripture version, and thread colors in parallel
    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const scriptureNoteIds = sortedNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter(Boolean) as string[];
    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];

    const [resourceMetadataMap, scriptureVersionMap, threadColorsMap] = await Promise.all([
      // Resource metadata
      (async () => {
        if (resourceNoteIds.length === 0) return {} as Record<string, any>;
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
            sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
          return rm.reduce((acc: any, meta) => {
            acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
            return acc;
          }, {} as Record<string, any>);
        } catch (_) { return {} as Record<string, any>; }
      })(),
      // Scripture version (translation) for scripture notes
      (async (): Promise<Record<string, string>> => {
        if (scriptureNoteIds.length === 0) return {};
        try {
          const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
          return rows.reduce((acc, row) => {
            if (row.noteId && row.translation) acc[row.noteId] = row.translation;
            return acc;
          }, {} as Record<string, string>);
        } catch (_) { return {}; }
      })(),
      // Thread colors
      getThreadColorsForNotesBatch(noteIds, userId),
    ]);

    const notesWithThreadColors = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      const version = note.noteType === 'scripture'
        ? (scriptureVersionMap[note.id] ?? extractScriptureTranslationFromNoteContent(note.content) ?? 'NET')
        : undefined;
      return {
        ...note,
        secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        version,
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
  viewerUserId: string,
  limit = 100,
  offset = 0
): Promise<{ notes: any[]; hasMore: boolean }> {
    await requireThreadReadAccess(db, { threadId, viewerUserId });
    const fetchLimit = limit + offset + 1;
    const contextThread = first(
      await db
        .select({
          spaceId: Threads.spaceId,
          mode: Threads.mode,
          sequenceNoteIds: Threads.sequenceNoteIds,
          sequenceCurrentNoteId: Threads.sequenceCurrentNoteId,
        })
        .from(Threads)
        .where(eq(Threads.id, threadId))
        .limit(1),
    );
    if (!contextThread?.spaceId) return { notes: [], hasMore: false };
    const memberThreadOrderBy = isOnboardingThread(threadId)
      ? [asc(Notes.simpleNoteId), asc(Notes.id)]
      : [
          desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id),
        ];
    const sharedThreadSelect = {
      ...NOTE_LIST_SELECT,
      associationIsPinned: SpaceNotes.isPinned,
      associationPrimaryCollection: SpaceNotes.primaryCollection,
      associationSecondaryCollections: SpaceNotes.secondaryCollections,
      associationCollectionPinned: SpaceNotes.collectionPinned,
      associationOrder: SpaceNotes.order,
    } as const;
    const junctionNotes = await db.select(sharedThreadSelect)
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .innerJoin(
        SpaceNotes,
        and(
          eq(SpaceNotes.noteId, Notes.id),
          eq(SpaceNotes.spaceId, contextThread.spaceId),
        ),
      )
      .where(and(
        eq(NoteThreads.threadId, threadId),
        isNull(SpaceNotes.removedAt),
        eq(Notes.contentEncrypted, false),
      ))
      .orderBy(...memberThreadOrderBy)
      /*
        A sequence is paginated by its authored order, which SQL here does not
        know — slicing the most-recently-updated `fetchLimit` rows first would
        hand back the wrong steps. Study plans are tens of steps, so fetch the
        plan and page it in memory, under a cap that is far above any real one.
      */
      .limit(hasStoredThreadOrder(contextThread) ? SEQUENCE_THREAD_FETCH_CAP : fetchLimit);

    const mappedMember = junctionNotes.map(note => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || '' }));
    const sortedAllNotes = isOnboardingThread(threadId)
      ? sortOnboardingThreadNotes(mappedMember)
      /*
        An arranged Thread is read in the order someone chose, not the order it
        was last touched — recency is exactly what arranging overrides.

        Keyed on the stored order rather than on `mode`, so reordering a
        collection Thread sticks without also turning it into a study plan.
        The step numbers, the current step and the pulse stay behind
        `isSequenceMode`; this is only which order the rows come back in.
      */
      : hasStoredThreadOrder(contextThread)
        ? sortNotesBySequence(mappedMember, contextThread)
        : sortNotesByLastUpdated(mappedMember);
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const scriptureNoteIds = sortedNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter(Boolean) as string[];
    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];

    const [resourceMetadataMap, scriptureVersionMap, threadColorsMap, authorMap] = await Promise.all([
      (async () => {
        if (resourceNoteIds.length === 0) return {} as Record<string, any>;
        const rm = await db.select({
          noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
        }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
        return rm.reduce((acc: any, meta) => {
          acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
          return acc;
        }, {} as Record<string, any>);
      })(),
      (async (): Promise<Record<string, string>> => {
        if (scriptureNoteIds.length === 0) return {};
        const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
          .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
        return rows.reduce((acc, row) => {
          if (row.noteId && row.translation) acc[row.noteId] = row.translation;
          return acc;
        }, {} as Record<string, string>);
      })(),
      Promise.resolve(new Map<string, Array<{ color: string; frequency: number }>>()),
      batchAuthorAttribution(sortedNotes.map((note) => note.userId)),
    ]);

    const notesWithThreadColors = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      const version = note.noteType === 'scripture'
        ? (scriptureVersionMap[note.id] ?? extractScriptureTranslationFromNoteContent(note.content) ?? 'NET')
        : undefined;
      return serializeSharedCanonicalNote({
        ...note,
        contextSpaceId: contextThread.spaceId!,
        contextThreadId: sharedThreadResultThreadId(note.threadId, threadId),
        authorUserId: note.userId,
        authorDisplayName: authorMap[note.userId]?.displayName ?? 'Former member',
        authorColor: authorMap[note.userId]?.userColor ?? 'blue',
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        version,
      });
    });

    return { notes: notesWithThreadColors, hasMore };
}

export function sharedThreadResultThreadId(
  _canonicalPrivateThreadId: string | null | undefined,
  contextThreadId: string,
): string {
  return contextThreadId;
}

// ─── Dashboard note helpers ─────────────────────────────────────────────────────

export async function getUnorganizedNotesForDashboard(userId: string, limit = 10) {
  try {
    const notes = await db.select(NOTE_SELECT_COLUMNS)
      .from(Notes).leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture'), isNull(NoteThreads.id)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(limit);

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
      ? and(
          eq(Notes.userId, userId),
          ne(Notes.noteType, 'scripture'),
          ne(Notes.threadId, unorganizedThread.id),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_SYSTEM_NOTES,
        )
      : and(
          eq(Notes.userId, userId),
          ne(Notes.noteType, 'scripture'),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_SYSTEM_NOTES,
        );

    const notes = await db.select(NOTE_SELECT_COLUMNS)
      .from(Notes).where(whereClause)
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(limit);

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

    // Thread lookup for enriching note items with thread context (title, color, gradient)
    const threadLookup = new Map<string, any>(threadsToUse.map(t => [t.id, t]));

    const threadItems = threadsToUse.map(thread => ({
      id: thread.id, type: "thread" as const, title: thread.title,
      subtitle: `${thread.noteCount} notes`, count: thread.noteCount,
      threadId: thread.id, spaceId: thread.spaceId,
      lastUpdated: thread.lastUpdated, updatedAt: thread.updatedAt || thread.createdAt,
      lastVisited: thread.lastVisited || null, createdAt: thread.createdAt,
      isPrivate: !thread.isPublic, accentColor: thread.accentColor, color: thread.color,
    }));

    // Fetch resource metadata and scripture version in parallel
    const resourceNoteIds = [...assignedNotes, ...unorganizedNotes].filter(n => n.noteType === 'resource').map(n => n.id);
    const scriptureNoteIds = [...assignedNotes, ...unorganizedNotes].filter(n => n.noteType === 'scripture').map(n => n.id).filter(Boolean) as string[];
    let resourceMetadataMap: Record<string, any> = {};
    let scriptureVersionMap: Record<string, string> = {};
    const [resourceResult, scriptureResult] = await Promise.all([
      (async () => {
        if (resourceNoteIds.length === 0) return {};
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
            sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
          return rm.reduce((acc: any, meta) => { acc[meta.noteId] = meta; return acc; }, {});
        } catch (_) { return {}; }
      })(),
      (async (): Promise<Record<string, string>> => {
        if (scriptureNoteIds.length === 0) return {};
        try {
          const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
          return rows.reduce((acc, row) => {
            if (row.noteId && row.translation) acc[row.noteId] = row.translation;
            return acc;
          }, {} as Record<string, string>);
        } catch (_) { return {}; }
      })(),
    ]);
    resourceMetadataMap = resourceResult;
    scriptureVersionMap = scriptureResult;

    // Fetch scripture references
    let scriptureReferencesMap: Record<string, Array<{ reference: string; noteId: string; translation?: string; threadColors?: Array<{ color: string; frequency: number }> }>> = {};
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
        ;

        const scriptureNoteIds = [...new Set(junctionEntries.map(e => e.scriptureNoteId))];
        let scriptureMetadataMap: Record<string, { reference: string; translation?: string }> = {};
        if (scriptureNoteIds.length > 0) {
          const sm = await db.select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
          scriptureMetadataMap = sm.reduce((acc: any, m) => { acc[m.noteId] = { reference: m.reference, translation: m.translation ?? undefined }; return acc; }, {});
        }

        const scriptureNoteIdsArray = scriptureNoteIds.filter(Boolean) as string[];
        const scriptureThreadColorsBatchMap = scriptureNoteIdsArray.length > 0
          ? await getThreadColorsForNotesBatch(scriptureNoteIdsArray, userId)
          : new Map<string, Array<{ color: string; frequency: number }>>();

        for (const entry of junctionEntries) {
          const meta = scriptureMetadataMap[entry.scriptureNoteId];
          if (meta) {
            if (!scriptureReferencesMap[entry.noteId]) scriptureReferencesMap[entry.noteId] = [];
            if (!scriptureReferencesMap[entry.noteId].some(r => r.noteId === entry.scriptureNoteId)) {
              scriptureReferencesMap[entry.noteId].push({
                reference: meta.reference, noteId: entry.scriptureNoteId,
                translation: meta.translation,
                threadColors: scriptureThreadColorsBatchMap.get(entry.scriptureNoteId) ?? undefined,
              });
            }
          }
        }

      } catch (error) {
        console.error('Error fetching scripture references:', error);
      }
    }

    // Scripture notes are excluded at the query level (getAssignedNotesForDashboard / getUnorganizedNotesForDashboard)

    const mapNote = (note: any) => {
      const cleanContent = stripHtmlForCard(note.content || "");
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const isEncrypted = note.contentEncrypted === true;
      const version = note.noteType === 'scripture'
        ? (scriptureVersionMap[note.id] ?? extractScriptureTranslationFromNoteContent(note.content) ?? 'NET')
        : undefined;
      const noteThread = threadLookup.get(note.threadId);
      return {
        id: note.id, type: "note" as const,
        title: resourceMeta?.sourceTitle || note.title || "Untitled Note",
        content: isEncrypted ? "" : (resourceMeta?.sourceDescription || cleanContent).substring(0, 150) + ((resourceMeta?.sourceDescription || cleanContent).length > 150 ? "..." : ""),
        // Full HTML content for seeding the note detail cache so opening a note shows content instantly
        rawContent: isEncrypted ? "" : (note.content || ""),
        rawTitle: note.title || "Untitled Note",
        contentEncrypted: isEncrypted, noteId: note.id, threadId: note.threadId, spaceId: note.spaceId,
        simpleNoteId: note.simpleNoteId ?? null,
        noteType: note.noteType || 'default', lastUpdated: note.lastUpdated,
        updatedAt: note.updatedAt || note.createdAt, lastVisited: note.lastVisited || null, createdAt: note.createdAt,
        resourceTitle: resourceMeta?.sourceTitle || null, resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null, threadColors: note.threadColors,
        scriptureReferences: scriptureReferencesMap[note.id] || undefined,
        version,
        userId: note.userId,
        threadTitle: note.threadId === 'thread_unorganized' ? MY_PILE_THREAD_TITLE : (noteThread?.title ?? null),
        threadColor: noteThread?.color ?? null,
        threadBackgroundGradient: noteThread?.backgroundGradient || (noteThread?.color ? getThreadGradientCSS(noteThread.color) : null),
        primaryCollection: note.primaryCollection ?? null,
        secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
        collectionPinned: note.collectionPinned ?? false,
        collectionUserOverride: note.collectionUserOverride ?? false,
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
      .where(and(eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')));

    const referencedIds = [...new Set(junctionEntries.map(e => e.scriptureNoteId))];
    if (referencedIds.length === 0) return [];

    const notes = await db.select(NOTE_SELECT_COLUMNS)
      .from(Notes)
      .where(and(inArray(Notes.id, referencedIds), eq(Notes.userId, userId), eq(Notes.noteType, 'scripture'), isNull(Notes.lastVisited)))
      ;

    if (notes.length === 0) return [];

    const noteIds = notes.map(n => n.id);
    const [threadColorsMap, scriptureVersionMap] = await Promise.all([
      getThreadColorsForNotesAsRecord(noteIds, userId),
      (async (): Promise<Record<string, string>> => {
        if (noteIds.length === 0) return {};
        try {
          const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, noteIds));
          return rows.reduce((acc, row) => {
            if (row.noteId && row.translation) acc[row.noteId] = row.translation;
            return acc;
          }, {} as Record<string, string>);
        } catch (_) { return {}; }
      })(),
    ]);

    return notes.map(note => {
      const cleanContent = stripHtmlForCard(note.content || "");
      return {
        id: note.id, type: "note" as const, title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        rawContent: note.content || "",
        rawTitle: note.title || "Untitled Note",
        noteId: note.id, threadId: note.threadId, spaceId: note.spaceId,
        simpleNoteId: note.simpleNoteId ?? null,
        noteType: note.noteType || 'scripture',
        lastUpdated: note.updatedAt || note.createdAt, updatedAt: note.updatedAt || note.createdAt,
        lastVisited: null, createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || undefined,
        version: scriptureVersionMap[note.id] ?? extractScriptureTranslationFromNoteContent(note.content) ?? 'NET',
        primaryCollection: note.primaryCollection ?? null,
        secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
        collectionPinned: note.collectionPinned ?? false,
        collectionUserOverride: note.collectionUserOverride ?? false,
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
      ).limit(fetchLimit).offset(offset);

    const sortedNotes = sortByLastVisited(notes.map(n => ({ ...n, updatedAt: n.updatedAt || n.createdAt, id: n.id || '' })));
    const limitedNotes = sortedNotes.slice(0, limit);

    const noteIds = limitedNotes.map(n => n.id);
    const [threadColorsMap, scriptureVersionMap] = await Promise.all([
      getThreadColorsForNotesAsRecord(noteIds, userId),
      (async (): Promise<Record<string, string>> => {
        if (noteIds.length === 0) return {};
        try {
          const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, noteIds));
          return rows.reduce((acc, row) => {
            if (row.noteId && row.translation) acc[row.noteId] = row.translation;
            return acc;
          }, {} as Record<string, string>);
        } catch (_) { return {}; }
      })(),
    ]);

    const noteItems = limitedNotes.map(note => {
      const cleanContent = stripHtmlForCard(note.content || "");
      return {
        id: note.id, type: "note" as const, title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        rawContent: note.content || "",
        rawTitle: note.title || "Untitled Note",
        noteId: note.id, threadId: note.threadId, spaceId: note.spaceId,
        simpleNoteId: note.simpleNoteId ?? null,
        noteType: note.noteType || 'scripture',
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        updatedAt: note.updatedAt || note.createdAt, lastVisited: note.lastVisited, createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || undefined,
        version: scriptureVersionMap[note.id] ?? extractScriptureTranslationFromNoteContent(note.content) ?? 'NET',
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
    const chronological = await spaceUsesChronologicalOrdering(spaceId);
    const threads = chronological
      ? await db
          .select({
            id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
            color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
            isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt,
            updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
          })
          .from(Threads)
          .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)))
          .orderBy(desc(Threads.isPinned), asc(Threads.createdAt), asc(Threads.id))
      : await db
          .select({
            id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
            color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
            isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt,
            updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
          })
          .from(Threads)
          .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)))
          .orderBy(
            desc(Threads.isPinned),
            asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
            desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt), asc(Threads.id)
          );

    const threadIds = threads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, userId)))
        .groupBy(NoteThreads.threadId);
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

export function visibleSharedThreadsForViewer<T extends { isPinned: boolean }>(
  threads: T[],
  viewerIsOwner: boolean,
): T[] {
  return viewerIsOwner ? threads : threads.filter((thread) => thread.isPinned);
}

export async function getThreadsForSpaceBySpaceId(spaceId: string) {
  try {
    const chronological = await spaceUsesChronologicalOrdering(spaceId);
    const threads = chronological
      ? await db
          .select({
            id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
            color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
            isPublic: Threads.isPublic, isPinned: Threads.isPinned,
            createdAt: Threads.createdAt, updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
          })
          .from(Threads)
          .where(eq(Threads.spaceId, spaceId))
          .orderBy(desc(Threads.isPinned), asc(Threads.createdAt), asc(Threads.id))
      : await db
          .select({
            id: Threads.id, title: Threads.title, subtitle: Threads.subtitle,
            color: Threads.color, spaceId: Threads.spaceId, userId: Threads.userId,
            isPublic: Threads.isPublic, isPinned: Threads.isPinned,
            createdAt: Threads.createdAt, updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
          })
          .from(Threads)
          .where(eq(Threads.spaceId, spaceId))
          .orderBy(
            desc(Threads.isPinned),
            asc(sql`CASE WHEN ${Threads.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
            desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt), asc(Threads.id)
          );

    const threadIds = threads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).where(inArray(NoteThreads.threadId, threadIds))
        .groupBy(NoteThreads.threadId);
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

export type GetNotesForSpaceOptions = {
  /** Omit classic `noteType: scripture` rows (2.0 shell uses pills + scripture index, not legacy scripture notes). */
  excludeLegacyScriptureNotes?: boolean;
  /** Prototype: sort by last edit (`updatedAt`), not visit time (`lastVisited`). */
  sortByLastUpdated?: boolean;
};

export async function getNotesForSpace(
  spaceId: string,
  userId: string,
  limit = 20,
  offset = 0,
  options?: GetNotesForSpaceOptions,
) {
  try {
    const fetchLimit = limit + offset + 1;
    const chronological = await spaceUsesChronologicalOrdering(spaceId);
    const contextSpace = first(
      await db
        .select({ title: Spaces.title, type: Spaces.type, userId: Spaces.userId })
        .from(Spaces)
        .where(eq(Spaces.id, spaceId))
        .limit(1),
    );
    const isMyHomeAggregate =
      contextSpace?.type === 'personal' &&
      contextSpace.userId === userId &&
      contextSpace.title.trim().toLowerCase() === 'my home';
    const spaceWhere = and(
      eq(Notes.userId, userId),
      ...(isMyHomeAggregate ? [] : [eq(Notes.spaceId, spaceId)]),
      NOT_ONBOARDING_NOTES_THREAD,
      NOT_ONBOARDING_SYSTEM_NOTES,
      ...(options?.excludeLegacyScriptureNotes ? [ne(Notes.noteType, 'scripture')] : []),
    );
    const sortByLastUpdated = options?.sortByLastUpdated === true;
    const allNotes = chronological
      ? await db
          .select(NOTE_LIST_SELECT)
          .from(Notes)
          .where(spaceWhere)
          .orderBy(desc(Notes.isPinned), asc(Notes.createdAt), asc(Notes.id))
          .limit(fetchLimit)
      : sortByLastUpdated
        ? await db
            .select(NOTE_LIST_SELECT)
            .from(Notes)
            .where(spaceWhere)
            .orderBy(desc(Notes.isPinned), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id))
            .limit(fetchLimit)
        : await db
            .select(NOTE_LIST_SELECT)
            .from(Notes)
            .where(spaceWhere)
            .orderBy(
              desc(Notes.isPinned),
              asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
              desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
            )
            .limit(fetchLimit);

    const mapped = allNotes.map(note => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || '' }));
    const sortedAllNotes = chronological
      ? sortByCreatedAtAsc(mapped)
      : sortByLastUpdated
        ? sortNotesByLastUpdated(mapped)
        : sortNotesByLastVisited(mapped);
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    // True space total (the fetch above is capped at limit+offset+1, so it can't come from `allNotes`).
    const totalRow = first(await db.select({ value: count() }).from(Notes).where(spaceWhere));
    const total = totalRow?.value ?? sortedAllNotes.length;

    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const scriptureNoteIds = sortedNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter(Boolean) as string[];
    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];

    const [resourceMetadataMap, scriptureVersionMap, threadColorsMap, sharedSpaceCountsMap, tagNamesMap] = await Promise.all([
      (async (): Promise<Record<string, any>> => {
        if (resourceNoteIds.length === 0) return {};
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
            sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
          return rm.reduce((acc: any, meta) => {
            acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
            return acc;
          }, {});
        } catch (_) { return {}; }
      })(),
      (async (): Promise<Record<string, string>> => {
        if (scriptureNoteIds.length === 0) return {};
        try {
          const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
          return rows.reduce((acc, row) => {
            if (row.noteId && row.translation) acc[row.noteId] = row.translation;
            return acc;
          }, {} as Record<string, string>);
        } catch (_) { return {}; }
      })(),
      getThreadColorsForNotesBatch(noteIds, userId),
      // Only My Home needs it: inside a shared space every row is by definition
      // in that space, so a "shared" badge there would be noise on every row.
      isMyHomeAggregate
        ? getSharedSpaceCountsForNotesBatch(noteIds, userId)
        : Promise.resolve(new Map<string, number>()),
      getTagNamesForNotesBatch(noteIds, userId),
    ]);

    const notesWithMeta = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      const sharedSpaceCount = sharedSpaceCountsMap.get(note.id) ?? 0;
      const tags = tagNamesMap.get(note.id);
      const version = note.noteType === 'scripture'
        ? (scriptureVersionMap[note.id] ?? extractScriptureTranslationFromNoteContent(note.content) ?? 'NET')
        : undefined;
      return {
        ...note,
        contextSpaceId: isMyHomeAggregate ? spaceId : note.spaceId,
        secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
        lastUpdated: sortByLastUpdated
          ? note.updatedAt || note.createdAt
          : note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        sharedSpaceCount: sharedSpaceCount > 0 ? sharedSpaceCount : undefined,
        tags: tags && tags.length > 0 ? tags : undefined,
        version,
      };
    });

    return { notes: notesWithMeta, hasMore, total };
  } catch (error) {
    console.error("Error fetching notes for space:", error);
    return { notes: [], hasMore: false, total: 0 };
  }
}

/**
 * Merged-author note list for shared (and future public) spaces.
 *
 * Unlike getNotesForSpace this does NOT filter by author: every member's
 * contributions appear, locked notes are excluded for every viewer (including
 * their own — docs rule), and each row carries author attribution fields
 * (authorUserId / authorDisplayName / authorColor) from UserMetadata so the
 * client doesn't need an N+1 against the members endpoint.
 */
export async function getNotesForSharedSpace(
  spaceId: string,
  viewerUserId: string,
  limit = 20,
  offset = 0,
  options?: GetNotesForSpaceOptions,
) {
  try {
    const fetchLimit = limit + offset + 1;
    const chronological = await spaceUsesChronologicalOrdering(spaceId);
    const spaceWhere = and(
      eq(SpaceNotes.spaceId, spaceId),
      isNull(SpaceNotes.removedAt),
      eq(Notes.contentEncrypted, false),
      NOT_ONBOARDING_NOTES_THREAD,
      NOT_ONBOARDING_SYSTEM_NOTES,
      ...(options?.excludeLegacyScriptureNotes ? [ne(Notes.noteType, 'scripture')] : []),
    );
    const sortByLastUpdated = options?.sortByLastUpdated === true;
    const select = {
      ...NOTE_LIST_SELECT,
      userId: Notes.userId,
      associationIsPinned: SpaceNotes.isPinned,
      associationPrimaryCollection: SpaceNotes.primaryCollection,
      associationSecondaryCollections: SpaceNotes.secondaryCollections,
      associationCollectionPinned: SpaceNotes.collectionPinned,
      associationOrder: SpaceNotes.order,
    } as const;
    const allNotes = chronological
      ? await db
          .select(select)
          .from(SpaceNotes)
          .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
          .where(spaceWhere)
          .orderBy(desc(SpaceNotes.isPinned), asc(Notes.createdAt), asc(Notes.id))
          .limit(fetchLimit)
      : sortByLastUpdated
        ? await db
            .select(select)
            .from(SpaceNotes)
            .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
            .where(spaceWhere)
            .orderBy(desc(SpaceNotes.isPinned), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id))
            .limit(fetchLimit)
        : await db
            .select(select)
            .from(SpaceNotes)
            .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
            .where(spaceWhere)
            .orderBy(
              desc(SpaceNotes.isPinned),
              desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
            )
            .limit(fetchLimit);

    const mapped = allNotes.map(note => ({ ...note, updatedAt: note.updatedAt || note.createdAt, id: note.id || '' }));
    const sortedAllNotes = chronological
      ? sortByCreatedAtAsc(mapped)
      : sortNotesByLastUpdated(mapped);
    const hasMore = sortedAllNotes.length > offset + limit;
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    const totalRow = first(
      await db
        .select({ value: count() })
        .from(SpaceNotes)
        .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
        .where(spaceWhere),
    );
    const total = totalRow?.value ?? sortedAllNotes.length;

    const resourceNoteIds = sortedNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const scriptureNoteIds = sortedNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter(Boolean) as string[];
    const noteIds = sortedNotes.map(n => n.id).filter(Boolean) as string[];
    const authorIds = [...new Set(sortedNotes.map(n => n.userId).filter(Boolean))] as string[];

    const [resourceMetadataMap, scriptureVersionMap, threadColorsMap, authorMap, tagNamesMap] = await Promise.all([
      (async (): Promise<Record<string, any>> => {
        if (resourceNoteIds.length === 0) return {};
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
            sourceDomain: ResourceMetadata.sourceDomain, sourceName: ResourceMetadata.sourceName,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
          return rm.reduce((acc: any, meta) => {
            acc[meta.noteId] = { sourceTitle: meta.sourceTitle, sourceDescription: meta.sourceDescription, sourceImage: meta.sourceImage, sourceDomain: meta.sourceDomain, sourceName: meta.sourceName };
            return acc;
          }, {});
        } catch (_) { return {}; }
      })(),
      (async (): Promise<Record<string, string>> => {
        if (scriptureNoteIds.length === 0) return {};
        try {
          const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
          return rows.reduce((acc, row) => {
            if (row.noteId && row.translation) acc[row.noteId] = row.translation;
            return acc;
          }, {} as Record<string, string>);
        } catch (_) { return {}; }
      })(),
      Promise.resolve(new Map<string, Array<{ color: string; frequency: number }>>()),
      batchAuthorAttribution(authorIds),
      // Viewer-scoped: only tags this member applied themselves, never another
      // member's private labels on the same shared note.
      getTagNamesForNotesBatch(noteIds, viewerUserId),
    ]);

    const notesWithMeta = sortedNotes.map(note => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      const author = authorMap[note.userId as string];
      const tags = tagNamesMap.get(note.id);
      const version = note.noteType === 'scripture'
        ? (scriptureVersionMap[note.id] ?? extractScriptureTranslationFromNoteContent(note.content) ?? 'NET')
        : undefined;
      return serializeSharedCanonicalNote({
        ...note,
        contextSpaceId: spaceId,
        contextThreadId: null,
        lastUpdated: note.updatedAt || note.createdAt,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        tags: tags && tags.length > 0 ? tags : undefined,
        version,
        authorUserId: note.userId,
        authorDisplayName: author?.displayName ?? 'Member',
        authorColor: author?.userColor ?? 'blue',
        isOwnNote: note.userId === viewerUserId,
      });
    });

    return { notes: notesWithMeta, hasMore, total };
  } catch (error) {
    console.error("Error fetching notes for shared space:", error);
    return { notes: [], hasMore: false, total: 0 };
  }
}

/** @deprecated superseded by getNotesForSharedSpace (merged-author, paginated, attributed). */
export async function getNotesForSpaceForMember(
  spaceId: string,
  ownerUserId: string,
  limit = 100,
  offset = 0
): Promise<{ notes: any[]; hasMore: boolean }> {
  const result = await getNotesForSharedSpace(spaceId, ownerUserId, limit, offset);
  return { notes: result.notes, hasMore: result.hasMore };
}
