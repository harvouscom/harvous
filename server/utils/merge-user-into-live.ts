/**
 * Merge a dev (pk_test) user's data into the live (pk_live) user so the live ID
 * becomes the canonical owner in Turso. Used by middleware on first login and
 * by scripts/merge-test-user-into-live.ts for batch merge.
 */

import {
  getDb,
  first,
  Spaces,
  Threads,
  Notes,
  Comments,
  Members,
  SpaceInvitations,
  SpaceMemberships,
  SpaceInvites,
  UserMetadata,
  UserXP,
  UserSeasonalXP,
  UserLifetimeXP,
  WeeklyStreaks,
  Tags,
  UserInboxItems,
} from '../db';
import { eq, and } from 'drizzle-orm';
import { nowISO } from '../db/dates';

export type MergeLog = (msg: string) => void;

/**
 * Merge all data from devUserId (test) into liveUserId (live). Safe to call
 * when dev and live are the same (no-op). Optionally pass a logger for scripts.
 */
export async function mergeDevUserIntoLive(
  devUserId: string,
  liveUserId: string,
  log: MergeLog = () => {}
): Promise<void> {
  if (devUserId === liveUserId) return;

  const db = getDb();

  await db.update(Spaces).set({ userId: liveUserId }).where(eq(Spaces.userId, devUserId));
  await db.update(Threads).set({ userId: liveUserId }).where(eq(Threads.userId, devUserId));
  await db.update(Notes).set({ userId: liveUserId }).where(eq(Notes.userId, devUserId));
  await db.update(Comments).set({ userId: liveUserId }).where(eq(Comments.userId, devUserId));
  // Hygiene reassignment on the frozen v1 tables (kept until they are dropped)
  await db.update(Members).set({ userId: liveUserId }).where(eq(Members.userId, devUserId));
  await db.update(SpaceInvitations).set({ invitedBy: liveUserId }).where(eq(SpaceInvitations.invitedBy, devUserId));
  await db.update(SpaceInvitations).set({ invitedUserId: liveUserId }).where(eq(SpaceInvitations.invitedUserId, devUserId));
  await db.update(SpaceMemberships).set({ userId: liveUserId }).where(eq(SpaceMemberships.userId, devUserId));
  await db.update(SpaceMemberships).set({ invitedBy: liveUserId }).where(eq(SpaceMemberships.invitedBy, devUserId));
  await db.update(SpaceInvites).set({ createdBy: liveUserId }).where(eq(SpaceInvites.createdBy, devUserId));
  await db.update(UserXP).set({ userId: liveUserId }).where(eq(UserXP.userId, devUserId));
  await db.update(WeeklyStreaks).set({ userId: liveUserId }).where(eq(WeeklyStreaks.userId, devUserId));
  await db.update(Tags).set({ userId: liveUserId }).where(eq(Tags.userId, devUserId));
  await db.update(UserInboxItems).set({ userId: liveUserId }).where(eq(UserInboxItems.userId, devUserId));
  log('Reassigned content: Spaces, Threads, Notes, Comments, Members, SpaceInvitations, SpaceMemberships, SpaceInvites, UserXP, WeeklyStreaks, Tags, UserInboxItems');

  const liveMeta = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, liveUserId)).limit(1));
  const devMeta = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, devUserId)).limit(1));
  if (devMeta) {
    if (liveMeta) {
      const maxSimpleNoteId = Math.max(
        liveMeta.highestSimpleNoteId ?? 0,
        devMeta.highestSimpleNoteId ?? 0
      );
      await db.update(UserMetadata).set({
        highestSimpleNoteId: maxSimpleNoteId,
        updatedAt: nowISO(),
      }).where(eq(UserMetadata.userId, liveUserId));
      log(`Merged UserMetadata: highestSimpleNoteId = max(live, test) = ${maxSimpleNoteId}`);
    } else {
      await db.update(UserMetadata).set({ userId: liveUserId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, devUserId));
      log('Reassigned test UserMetadata row to live (live had none)');
    }
    await db.delete(UserMetadata).where(eq(UserMetadata.userId, devUserId));
  }

  const liveLifetime = first(await db.select().from(UserLifetimeXP).where(eq(UserLifetimeXP.userId, liveUserId)).limit(1));
  const devLifetime = first(await db.select().from(UserLifetimeXP).where(eq(UserLifetimeXP.userId, devUserId)).limit(1));
  if (devLifetime) {
    if (liveLifetime) {
      const combinedTotal = (liveLifetime.totalXP ?? 0) + (devLifetime.totalXP ?? 0);
      const latestUpdated = [liveLifetime.lastUpdated, devLifetime.lastUpdated].filter(Boolean).sort().pop()!;
      await db.update(UserLifetimeXP).set({
        totalXP: combinedTotal,
        lastUpdated: latestUpdated,
      }).where(eq(UserLifetimeXP.userId, liveUserId));
      log(`Merged UserLifetimeXP: totalXP = live + test = ${combinedTotal}`);
    } else {
      await db.update(UserLifetimeXP).set({ userId: liveUserId }).where(eq(UserLifetimeXP.userId, devUserId));
      log('Reassigned test UserLifetimeXP row to live (live had none)');
    }
    await db.delete(UserLifetimeXP).where(eq(UserLifetimeXP.userId, devUserId));
  }

  const devSeasonal = await db.select().from(UserSeasonalXP).where(eq(UserSeasonalXP.userId, devUserId));
  for (const row of devSeasonal) {
    const liveRow = first(await db.select().from(UserSeasonalXP).where(and(eq(UserSeasonalXP.userId, liveUserId), eq(UserSeasonalXP.season, row.season))).limit(1));
    if (liveRow) {
      await db.update(UserSeasonalXP).set({
        totalXP: (liveRow.totalXP ?? 0) + (row.totalXP ?? 0),
        sessionCount: (liveRow.sessionCount ?? 0) + (row.sessionCount ?? 0),
        updatedAt: nowISO(),
      }).where(eq(UserSeasonalXP.id, liveRow.id));
      await db.delete(UserSeasonalXP).where(eq(UserSeasonalXP.id, row.id));
    } else {
      await db.update(UserSeasonalXP).set({ userId: liveUserId, updatedAt: nowISO() }).where(eq(UserSeasonalXP.id, row.id));
    }
  }
  if (devSeasonal.length) log(`Merged UserSeasonalXP: ${devSeasonal.length} season(s)`);

  log(`Done. Live account ${liveUserId} now owns all data.`);
}
