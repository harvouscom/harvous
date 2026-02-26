/**
 * Fix a single ClerkUserMapping row when devUserId was wrongly set to the live ID
 * (e.g. because UserMetadata had already been updated to the live ID when populate ran).
 *
 * Usage (from repo root, with production DB credentials in .env):
 *   CORRECT_DEV_USER_ID=user_35TxUL... CORRECT_LIVE_USER_ID=user_35FUJeL... npx tsx scripts/fix-clerk-mapping-row.ts
 *
 * Optional: EMAIL=derekj@hey.com if you want to ensure the row is keyed by that email.
 *
 * Requires: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN.
 */
import 'dotenv/config';
import { db, ClerkUserMapping } from '../server/db';
import { eq, or } from 'drizzle-orm';

async function main() {
  const correctDevId = process.env.CORRECT_DEV_USER_ID;
  const correctLiveId = process.env.CORRECT_LIVE_USER_ID;
  const emailOverride = process.env.EMAIL?.trim().toLowerCase();

  if (!correctDevId || !correctLiveId) {
    console.error('Set CORRECT_DEV_USER_ID (the ID that has the data in Turso) and CORRECT_LIVE_USER_ID (current Clerk Production ID).');
    process.exit(1);
  }
  if (correctDevId === correctLiveId) {
    console.error('CORRECT_DEV_USER_ID and CORRECT_LIVE_USER_ID must be different.');
    process.exit(1);
  }

  const existing = await db
    .select()
    .from(ClerkUserMapping)
    .where(or(eq(ClerkUserMapping.devUserId, correctLiveId), eq(ClerkUserMapping.liveUserId, correctLiveId)))
    .all();

  const email = emailOverride ?? existing[0]?.email ?? null;
  if (!email) {
    console.error('No existing row found for that live ID and EMAIL not set. Set EMAIL=... to create the correct row.');
    process.exit(1);
  }

  for (const row of existing) {
    await db.delete(ClerkUserMapping).where(eq(ClerkUserMapping.devUserId, row.devUserId));
    console.log('Removed wrong row: devUserId was', row.devUserId);
  }

  await db.insert(ClerkUserMapping).values({
    devUserId: correctDevId,
    email,
    liveUserId: correctLiveId,
    migratedToLiveAt: null,
  }).onConflictDoUpdate({
    target: ClerkUserMapping.devUserId,
    set: {
      email,
      liveUserId: correctLiveId,
      migratedToLiveAt: null,
    },
  });

  console.log('Set correct row: devUserId =', correctDevId, ', liveUserId =', correctLiveId, ', email =', email);
  console.log('On next login the middleware will merge dev → live and then use the live ID.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
