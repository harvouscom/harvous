/**
 * Idempotent E2E seed: ensures space_test_2, invitation, and clean member state
 * so join/invite Playwright tests pass every run.
 *
 * Run for both local and remote (e.g. ASTRO_DB_REMOTE_URL for remote, or a local Turso URL).
 * Usage: tsx scripts/seed-e2e.ts
 * For remote-only: set ASTRO_DB_REMOTE_URL and ASTRO_DB_APP_TOKEN in .env.
 */
import 'dotenv/config';
import { db, Spaces, SpaceInvitations, Members } from '../server/db';
import { eq, and, ne } from 'drizzle-orm';
import { nowISO } from '../server/db/dates';

const SPACE_ID = 'space_test_2';
const INVITE_TOKEN = 'inviteToken12';

async function main() {
  const spaceOwnerId = process.env.TEST_USER_A_CLERK_ID ?? 'user_test_123';
  const now = nowISO();

  // 1. Ensure space_test_2 exists (idempotent)
  try {
    await db.insert(Spaces).values({
      id: SPACE_ID,
      title: 'Test Space 2',
      description: 'Another test space',
      color: 'lovely-lavender',
      createdAt: now,
      updatedAt: now,
      userId: spaceOwnerId,
      isPublic: true,
      isActive: true,
      order: 2,
      shareToken: 'testToken123',
      shareTokenCreatedAt: now,
    });
  } catch {
    // UNIQUE constraint = already exists
  }

  // 2. Remove non-owner members so User B sees Join / Accept button
  await db
    .delete(Members)
    .where(and(eq(Members.spaceId, SPACE_ID), ne(Members.userId, spaceOwnerId)));

  // 3. Invitation: delete then insert so status is always pending
  await db.delete(SpaceInvitations).where(eq(SpaceInvitations.inviteToken, INVITE_TOKEN));
  await db.insert(SpaceInvitations).values({
    id: 'invite_e2e_1',
    spaceId: SPACE_ID,
    invitedBy: spaceOwnerId,
    invitedEmail: null,
    invitedUserId: null,
    inviteToken: INVITE_TOKEN,
    role: 'member',
    status: 'pending',
    message: null,
    expiresAt: null,
    createdAt: now,
    acceptedAt: null,
  });

  console.log('E2E seed ok: space_test_2, invitation, members reset');
}

main().catch((err) => {
  console.error('E2E seed failed:', err);
  process.exit(1);
});
