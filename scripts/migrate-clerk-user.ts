/**
 * One-off: Reassign all DB rows from an OLD Clerk user ID to a NEW one.
 * Use when the same person has two Clerk identities (e.g. duplicate account)
 * and you want the current session (new ID) to own the old account's data.
 *
 * Usage (from repo root):
 *   OLD_CLERK_USER_ID=user_35TxUL3GoQDZYHUoj90FXDtJveX \
 *   NEW_CLERK_USER_ID=user_35FUJeLEI2L0gRjCJqIIbNWraRK \
 *   npx tsx scripts/migrate-clerk-user.ts
 *
 * Requires: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN (e.g. from .env).
 *
 * Tables updated: Spaces, Threads, Notes, Comments, Members, SpaceInvitations
 * (invitedBy, invitedUserId), UserMetadata, UserXP, UserSeasonalXP,
 * UserLifetimeXP, WeeklyStreaks, Tags, UserInboxItems.
 *
 * For tables with unique userId (UserMetadata, UserLifetimeXP), the NEW
 * user's row is removed first so the OLD user's row can take the NEW userId.
 */
import 'dotenv/config';
import {
  db,
  Spaces,
  Threads,
  Notes,
  Comments,
  Members,
  SpaceInvitations,
  UserMetadata,
  UserXP,
  UserSeasonalXP,
  UserLifetimeXP,
  WeeklyStreaks,
  Tags,
  UserInboxItems,
} from '../server/db';
import { eq } from 'drizzle-orm';

const OLD_ID = process.env.OLD_CLERK_USER_ID;
const NEW_ID = process.env.NEW_CLERK_USER_ID;

if (!OLD_ID || !NEW_ID) {
  console.error('Set OLD_CLERK_USER_ID and NEW_CLERK_USER_ID (the old ID has the data; the new ID is what Clerk returns now).');
  process.exit(1);
}
if (OLD_ID === NEW_ID) {
  console.error('OLD and NEW must be different.');
  process.exit(1);
}

async function run() {
  console.log('Reassigning all rows from', OLD_ID, '->', NEW_ID);

  // Tables with unique userId: remove new user's row so we can reassign old row to new userId
  await db.delete(UserMetadata).where(eq(UserMetadata.userId, NEW_ID));
  console.log('  Cleared NEW user UserMetadata (if any)');
  await db.delete(UserLifetimeXP).where(eq(UserLifetimeXP.userId, NEW_ID));
  console.log('  Cleared NEW user UserLifetimeXP (if any)');

  await db.update(Spaces).set({ userId: NEW_ID }).where(eq(Spaces.userId, OLD_ID));
  await db.update(Threads).set({ userId: NEW_ID }).where(eq(Threads.userId, OLD_ID));
  await db.update(Notes).set({ userId: NEW_ID }).where(eq(Notes.userId, OLD_ID));
  await db.update(Comments).set({ userId: NEW_ID }).where(eq(Comments.userId, OLD_ID));
  await db.update(Members).set({ userId: NEW_ID }).where(eq(Members.userId, OLD_ID));
  await db.update(SpaceInvitations).set({ invitedBy: NEW_ID }).where(eq(SpaceInvitations.invitedBy, OLD_ID));
  await db.update(SpaceInvitations).set({ invitedUserId: NEW_ID }).where(eq(SpaceInvitations.invitedUserId, OLD_ID));
  await db.update(UserMetadata).set({ userId: NEW_ID }).where(eq(UserMetadata.userId, OLD_ID));
  await db.update(UserXP).set({ userId: NEW_ID }).where(eq(UserXP.userId, OLD_ID));
  await db.update(UserSeasonalXP).set({ userId: NEW_ID }).where(eq(UserSeasonalXP.userId, OLD_ID));
  await db.update(UserLifetimeXP).set({ userId: NEW_ID }).where(eq(UserLifetimeXP.userId, OLD_ID));
  await db.update(WeeklyStreaks).set({ userId: NEW_ID }).where(eq(WeeklyStreaks.userId, OLD_ID));
  await db.update(Tags).set({ userId: NEW_ID }).where(eq(Tags.userId, OLD_ID));
  await db.update(UserInboxItems).set({ userId: NEW_ID }).where(eq(UserInboxItems.userId, OLD_ID));

  console.log('  Updated Spaces, Threads, Notes, Comments, Members, SpaceInvitations, UserMetadata, UserXP, UserSeasonalXP, UserLifetimeXP, WeeklyStreaks, Tags, UserInboxItems');
  console.log('Done. Log in with the account that has Clerk ID', NEW_ID, 'to see all data.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
