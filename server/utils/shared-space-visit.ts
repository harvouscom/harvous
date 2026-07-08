/**
 * Per-membership "new since you were here" helpers for shared/public spaces.
 */
import { db, first, Notes, SpaceMemberships, Spaces, eq, and, count, gt, inArray, ne } from '../db';
import { nowISO } from '../db/dates';
import { requireSpaceAccess } from './space-access';
import { getNotesForSharedSpace } from './dashboard-data';

export interface SharedSpaceVisitResult {
  previousVisitedAt: string | null;
  newNoteCount: number;
  totalNoteCount: number;
}

function visitWatermark(membership: { lastVisitedAt: string | null; joinedAt: string }): string | null {
  return membership.lastVisitedAt ?? null;
}

export async function countNewNotesInSpaceSince(spaceId: string, sinceIso: string): Promise<number> {
  const row = first(
    await db
      .select({ value: count() })
      .from(Notes)
      .where(
        and(eq(Notes.spaceId, spaceId), eq(Notes.contentEncrypted, false), gt(Notes.updatedAt, sinceIso)),
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

  const previousVisitedAt = membership.lastVisitedAt ?? null;
  let newNoteCount = 0;
  if (previousVisitedAt) {
    newNoteCount = await countNewNotesInSpaceSince(spaceId, previousVisitedAt);
  }

  const totalRow = first(
    await db
      .select({ value: count() })
      .from(Notes)
      .where(and(eq(Notes.spaceId, spaceId), eq(Notes.contentEncrypted, false))),
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
    newNoteCount = await countNewNotesInSpaceSince(spaceId, watermark);
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
      const updated = note.lastUpdated ?? note.updatedAt;
      if (!updated || updated <= watermark) continue;
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

/** Batch new-note counts for navigation switcher badges (shared/public memberships only). */
export async function getNewNoteCountsForUser(userId: string): Promise<Map<string, number>> {
  const memberships = await db
    .select({
      spaceId: SpaceMemberships.spaceId,
      lastVisitedAt: SpaceMemberships.lastVisitedAt,
      joinedAt: SpaceMemberships.joinedAt,
      type: Spaces.type,
    })
    .from(SpaceMemberships)
    .innerJoin(Spaces, eq(SpaceMemberships.spaceId, Spaces.id))
    .where(and(eq(SpaceMemberships.userId, userId), ne(Spaces.type, 'personal')));

  const result = new Map<string, number>();
  await Promise.all(
    memberships.map(async (m) => {
      const watermark = visitWatermark(m);
      if (!watermark) {
        result.set(m.spaceId, 0);
        return;
      }
      const cnt = await countNewNotesInSpaceSince(m.spaceId, watermark);
      if (cnt > 0) result.set(m.spaceId, cnt);
    }),
  );
  return result;
}

export function isNoteNewSinceVisit(
  noteUpdatedAt: string | null | undefined,
  unseenSince: string | null | undefined,
): boolean {
  if (!unseenSince || !noteUpdatedAt) return false;
  return noteUpdatedAt > unseenSince;
}

export async function getSpaceMemberUserIds(spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: SpaceMemberships.userId })
    .from(SpaceMemberships)
    .where(eq(SpaceMemberships.spaceId, spaceId));
  return [...new Set(rows.map((r) => r.userId).filter(Boolean))];
}
