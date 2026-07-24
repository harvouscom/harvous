/**
 * One-time migration: promote the Harvous system user's spaces onto the new
 * Shared Spaces rails so they keep working after v1 sharing (Members /
 * SpaceInvitations) is retired.
 *
 * The Harvous system user is a live first-party surface — featured spaces
 * fed by /api/admin/spaces/:spaceId/members (server/routes/admin.ts) and
 * auto-dismissed via shareToken/refId matching in /api/featured/items
 * (server/routes/featured.ts). Everyone else's v1 shared spaces retire
 * naturally (they silently become plain personal spaces for their owners;
 * their old Members rows just stop being read).
 *
 * For each space owned by the Harvous system user:
 *   1. Set Spaces.type = 'shared' (if not already).
 *   2. Ensure an owner SpaceMemberships row exists for the system user.
 *   3. Copy each legacy Members row into SpaceMemberships (skip if already present).
 *
 * Idempotent — safe to re-run. Grants the system user the Shared Spaces
 * add-on entitlement so /api/spaces/create-shared style gates never block it.
 *
 * Usage (requires the same Supabase env as the API; and HARVOUS_SYSTEM_USER_ID):
 *   npx tsx server/scripts/migrate-harvous-system-spaces.ts --dry-run
 *   npx tsx server/scripts/migrate-harvous-system-spaces.ts
 */

import 'dotenv/config';
import { db, Spaces, Members, SpaceMemberships, UserMetadata, eq, and } from '../db';
import { nowISO } from '../db/dates';
import { getHarvousSystemUserId } from '../utils/harvous-admin';
import { setSharedSpacesAddOnForUserId } from '../utils/tier-limits';

function parseArgs() {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs();
  const systemUserId = getHarvousSystemUserId();

  const spaces = await db.select().from(Spaces).where(eq(Spaces.userId, systemUserId));
  console.log(`${dryRun ? '[dry-run] ' : ''}Found ${spaces.length} space(s) owned by the Harvous system user (${systemUserId}).`);

  let promoted = 0;
  let ownerRowsCreated = 0;
  let membersCopied = 0;

  for (const space of spaces) {
    if (space.type !== 'shared') {
      promoted++;
      console.log(`  type=shared → ${space.id} (${space.title})`);
      if (!dryRun) {
        await db.update(Spaces).set({ type: 'shared', updatedAt: nowISO() }).where(eq(Spaces.id, space.id));
      }
    }

    const ownerRow = await db.select({ id: SpaceMemberships.id }).from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, space.id), eq(SpaceMemberships.userId, systemUserId))).limit(1);
    if (ownerRow.length === 0) {
      ownerRowsCreated++;
      console.log(`  + owner membership → ${space.id}`);
      if (!dryRun) {
        const now = nowISO();
        await db.insert(SpaceMemberships).values({
          id: `smem_${crypto.randomUUID()}`,
          spaceId: space.id,
          userId: systemUserId,
          role: 'owner',
          joinedAt: now,
          createdAt: now,
        }).onConflictDoNothing();
      }
    }

    const legacyMembers = await db.select().from(Members).where(eq(Members.spaceId, space.id));
    for (const legacy of legacyMembers) {
      const existing = await db.select({ id: SpaceMemberships.id }).from(SpaceMemberships)
        .where(and(eq(SpaceMemberships.spaceId, space.id), eq(SpaceMemberships.userId, legacy.userId))).limit(1);
      if (existing.length > 0) continue;

      membersCopied++;
      console.log(`  + member ${legacy.userId} → ${space.id}`);
      if (!dryRun) {
        const now = nowISO();
        await db.insert(SpaceMemberships).values({
          id: `smem_${crypto.randomUUID()}`,
          spaceId: space.id,
          userId: legacy.userId,
          role: legacy.role === 'admin' ? 'leader' : 'member',
          joinedAt: legacy.joinedAt ?? legacy.createdAt,
          createdAt: legacy.createdAt,
        }).onConflictDoNothing();
      }
    }
  }

  const addOnRow = await db.select({ sharedSpacesAddOn: UserMetadata.sharedSpacesAddOn })
    .from(UserMetadata).where(eq(UserMetadata.userId, systemUserId)).limit(1);
  if (addOnRow[0] && !addOnRow[0].sharedSpacesAddOn) {
    console.log(`  grant sharedSpacesAddOn → ${systemUserId}`);
    if (!dryRun) await setSharedSpacesAddOnForUserId(systemUserId, true);
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}Done. ${promoted} promoted to type=shared, ${ownerRowsCreated} owner rows created, ${membersCopied} members copied.`);
  if (dryRun) console.log('Re-run without --dry-run to write.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('migrate-harvous-system-spaces failed:', err);
  process.exit(1);
});
