/**
 * Per-membership "new since you were here" helpers for shared/public spaces.
 * Counts exclude the viewer’s own notes — badges mean others’ activity, not your edits.
 */
import { db, first, Notes, SpaceNotes, SpaceMemberships, Spaces, eq, and, count, gt, ne, isNull, sql } from '../db';
import { nowISO } from '../db/dates';
import { requireSpaceAccess } from './space-access';
import { getNotesForSharedSpace } from './dashboard-data';

export interface SharedSpaceVisitResult {
  previousVisitedAt: Date | null;
  newNoteCount: number;
  totalNoteCount: number;
}

/** Prefer last visit; fall back to join so new members can catch up before first stamp. */
function visitWatermark(membership: { lastVisitedAt: Date | null; joinedAt: Date }): Date | null {
  return membership.lastVisitedAt ?? membership.joinedAt ?? null;
}

/** Notes updated after `sinceIso`, excluding the viewer’s own authorship. */
export async function countNewNotesInSpaceSince(
  spaceId: string,
  sinceIso: Date,
  viewerUserId: string,
): Promise<number> {
  const row = first(
    await db
      .select({ value: count() })
      .from(SpaceNotes)
      .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
      .where(
        and(
          eq(SpaceNotes.spaceId, spaceId),
          isNull(SpaceNotes.removedAt),
          eq(Notes.contentEncrypted, false),
          gt(Notes.updatedAt, sinceIso),
          ne(Notes.userId, viewerUserId),
        ),
      ),
  );
  return Number(row?.value ?? 0);
}

export async function getMembershipRow(spaceId: string, userId: string) {
  return first(
    await db
      .select()
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, userId)))
      .limit(1),
  );
}

/** Stamp visit and return counts computed against the prior watermark. */
export async function recordSharedSpaceVisit(spaceId: string, userId: string): Promise<SharedSpaceVisitResult> {
  const access = await requireSpaceAccess(spaceId, userId);
  if (access.space.type === 'personal') {
    const totalRow = first(
      await db
        .select({ value: count() })
        .from(Notes)
        .where(and(eq(Notes.spaceId, spaceId), eq(Notes.contentEncrypted, false))),
    );
    return { previousVisitedAt: null, newNoteCount: 0, totalNoteCount: Number(totalRow?.value ?? 0) };
  }

  const membership = await getMembershipRow(spaceId, userId);
  if (!membership) {
    return { previousVisitedAt: null, newNoteCount: 0, totalNoteCount: 0 };
  }

  // Watermark for catch-up count (last visit, or join time on first open).
  const previousVisitedAt = visitWatermark(membership);
  let newNoteCount = 0;
  if (previousVisitedAt) {
    newNoteCount = await countNewNotesInSpaceSince(spaceId, previousVisitedAt, userId);
  }

  const totalRow = first(
    await db
      .select({ value: count() })
      .from(SpaceNotes)
      .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
      .where(and(eq(SpaceNotes.spaceId, spaceId), isNull(SpaceNotes.removedAt), eq(Notes.contentEncrypted, false))),
  );
  const totalNoteCount = Number(totalRow?.value ?? 0);

  const now = nowISO();
  await db
    .update(SpaceMemberships)
    .set({ lastVisitedAt: now, updatedAt: now })
    .where(eq(SpaceMemberships.id, membership.id));

  return { previousVisitedAt, newNoteCount, totalNoteCount };
}

export async function getSharedSpaceActivityPreview(spaceId: string, userId: string) {
  const access = await requireSpaceAccess(spaceId, userId);
  const membership = access.space.type === 'personal' ? null : await getMembershipRow(spaceId, userId);

  let newNoteCount = 0;
  const watermark = membership ? visitWatermark(membership) : null;
  if (watermark) {
    newNoteCount = await countNewNotesInSpaceSince(spaceId, watermark, userId);
  }

  const { notes, total } = await getNotesForSharedSpace(spaceId, userId, 3, 0, {
    sortByLastUpdated: true,
    excludeLegacyScriptureNotes: true,
  });

  let newContributors: Array<{ displayName: string; noteCount: number }> = [];
  if (watermark && newNoteCount > 0) {
    const { notes: sampleForActivity } = await getNotesForSharedSpace(spaceId, userId, 24, 0, {
      sortByLastUpdated: true,
      excludeLegacyScriptureNotes: true,
    });
    const byAuthor = new Map<string, { displayName: string; noteCount: number }>();
    for (const note of sampleForActivity) {
      if (note.authorUserId && note.authorUserId === userId) continue;
      const updated = note.lastUpdated ?? note.updatedAt;
      if (!updated || new Date(updated).getTime() <= watermark.getTime()) continue;
      const key = note.authorUserId ?? note.authorDisplayName ?? 'member';
      const displayName = note.authorDisplayName ?? 'Someone';
      const row = byAuthor.get(key);
      if (row) row.noteCount += 1;
      else byAuthor.set(key, { displayName, noteCount: 1 });
    }
    newContributors = [...byAuthor.values()]
      .sort((a, b) => b.noteCount - a.noteCount || a.displayName.localeCompare(b.displayName))
      .slice(0, 3);
  }

  return {
    newNoteCount,
    totalNoteCount: total ?? notes.length,
    recentNotes: notes.slice(0, 3),
    newContributors,
  };
}

/**
 * Every space's badge count in one query.
 *
 * This used to read the membership list and then fire `countNewNotesInSpaceSince` once per
 * space, all at once through `Promise.all`. The width of that fan-out is the number of shared
 * spaces you belong to, and the pool it draws from is ten connections wide (`server/db/client.ts`)
 * — so a member of a dozen rooms could exhaust it on their own, on every navigation load, and
 * take the sidebar down with a `count(*)` error naming whichever query lost the race. Unbounded
 * concurrency against a fixed pool is not parallelism, it is a queue with a failure mode.
 *
 * The per-space watermark is what made it look like N queries were necessary, and it is not:
 * `lastVisitedAt ?? joinedAt` is `visitWatermark`, and both columns live on the membership row
 * being joined anyway. Expressed as `coalesce(...)` in the join, one grouped query answers for
 * every space at once.
 *
 * `SpaceMemberships_space_user_unique` guarantees one membership row per (space, user), so the
 * join cannot multiply a note into several counted rows.
 *
 * Spaces with no new notes are absent rather than present-and-zero, which the old code was
 * already inconsistent about (it set 0 for a missing watermark and omitted a genuine 0). Both
 * read the same downstream: every caller does `newNoteCounts.get(id) ?? 0`.
 */
export async function getNewNoteCountsForUser(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ spaceId: SpaceNotes.spaceId, value: count() })
    .from(SpaceNotes)
    .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
    .innerJoin(
      SpaceMemberships,
      and(eq(SpaceMemberships.spaceId, SpaceNotes.spaceId), eq(SpaceMemberships.userId, userId)),
    )
    .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
    .where(
      and(
        isNull(SpaceNotes.removedAt),
        eq(Notes.contentEncrypted, false),
        ne(Notes.userId, userId),
        ne(Spaces.type, 'personal'),
        isNull(Spaces.deletedAt),
        /* `visitWatermark`, in SQL. `joinedAt` is NOT NULL, so this never falls through to a
           null comparison — a member who has never opened the room catches up from their join. */
        gt(
          Notes.updatedAt,
          sql`coalesce(${SpaceMemberships.lastVisitedAt}, ${SpaceMemberships.joinedAt})`,
        ),
      ),
    )
    .groupBy(SpaceNotes.spaceId);

  const result = new Map<string, number>();
  for (const row of rows) {
    const value = Number(row.value ?? 0);
    if (value > 0) result.set(row.spaceId, value);
  }
  return result;
}

export function isNoteNewSinceVisit(
  noteUpdatedAt: string | Date | null | undefined,
  unseenSince: string | Date | null | undefined,
): boolean {
  if (!unseenSince || !noteUpdatedAt) return false;
  return new Date(noteUpdatedAt).getTime() > new Date(unseenSince).getTime();
}

export async function getSpaceMemberUserIds(spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: SpaceMemberships.userId })
    .from(SpaceMemberships)
    .innerJoin(Spaces, and(eq(Spaces.id, SpaceMemberships.spaceId), isNull(Spaces.deletedAt)))
    .where(eq(SpaceMemberships.spaceId, spaceId));
  return [...new Set(rows.map((r) => r.userId).filter(Boolean))];
}
