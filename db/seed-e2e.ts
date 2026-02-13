/**
 * Idempotent E2E seed: ensures space_test_2, invitation, and clean member state
 * so join/invite Playwright tests pass every run.
 *
 * Run for both local and remote in e2e global-setup so tests work regardless of
 * which DB the dev server uses.
 *
 * - Ensures space_test_2 exists (insert or ignore UNIQUE)
 * - Removes non-owner members from space_test_2 so User B sees Join/Accept
 * - Ensures invitation inviteToken12 exists (delete + insert)
 *
 * Requires TEST_USER_A_CLERK_ID in .env for space owner (or uses user_test_123).
 */
import { db, Spaces, SpaceInvitations, Members } from 'astro:db';
import { eq, and, ne } from 'astro:db';

const SPACE_ID = 'space_test_2';
const INVITE_TOKEN = 'inviteToken12';

export default async function() {
  const spaceOwnerId = process.env.TEST_USER_A_CLERK_ID ?? 'user_test_123';

  // 1. Ensure space_test_2 exists (idempotent)
  try {
    await db.insert(Spaces).values({
      id: SPACE_ID,
      title: 'Test Space 2',
      description: 'Another test space',
      color: 'lovely-lavender',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: spaceOwnerId,
      isPublic: true,
      isActive: true,
      order: 2,
      shareToken: 'testToken123',
      shareTokenCreatedAt: new Date(),
    });
  } catch {
    // UNIQUE constraint = already exists; update shareToken if needed (optional)
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
    createdAt: new Date(),
    acceptedAt: null,
  });

  console.log('E2E seed ok: space_test_2, invitation, members reset');
}
