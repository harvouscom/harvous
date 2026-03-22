/**
 * Seed a mock shared space owned by a fake user, with the current user as a member.
 * Use to test the About Space panel "Created by [owner] on [date]" section locally.
 *
 * Requires: MOCK_SPACE_MEMBER_CLERK_ID (your Clerk user ID so you appear as member).
 * Optional: override space id / title via env for debugging.
 *
 * Usage: MOCK_SPACE_MEMBER_CLERK_ID=user_xxx tsx scripts/seed-mock-shared-space.ts
 */
import 'dotenv/config';
import { db, Spaces, Members, UserMetadata } from '../server/db';
import { first } from '../server/db/helpers';
import { eq } from 'drizzle-orm';
import { nowISO } from '../server/db/dates';

const FAKE_OWNER_ID = 'user_mock_owner_1';
const SPACE_ID = process.env.MOCK_SPACE_ID ?? 'space_mock_shared_1';
const SPACE_TITLE = process.env.MOCK_SPACE_TITLE ?? 'Mock shared space';

async function main() {
  const memberClerkId = process.env.MOCK_SPACE_MEMBER_CLERK_ID;
  if (!memberClerkId) {
    console.error('Set MOCK_SPACE_MEMBER_CLERK_ID to your Clerk user ID (the member who will see About Space).');
    process.exit(1);
  }

  const now = nowISO();

  // 1. Upsert fake owner UserMetadata (idempotent: insert or update so display name is set)
  const existingMeta = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, FAKE_OWNER_ID)).limit(1));
  if (existingMeta) {
    await db
      .update(UserMetadata)
      .set({
        firstName: 'Mock',
        lastName: 'Owner',
        userColor: 'lovely-lavender',
        updatedAt: now,
      })
      .where(eq(UserMetadata.userId, FAKE_OWNER_ID));
  } else {
    await db.insert(UserMetadata).values({
      id: `user_metadata_${FAKE_OWNER_ID}`,
      userId: FAKE_OWNER_ID,
      highestSimpleNoteId: 0,
      userColor: 'lovely-lavender',
      firstName: 'Mock',
      lastName: 'Owner',
      email: null,
      profileImageUrl: null,
      clerkDataUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 2. Space: delete then insert so re-runs are idempotent with same id
  await db.delete(Spaces).where(eq(Spaces.id, SPACE_ID));
  await db.insert(Spaces).values({
    id: SPACE_ID,
    title: SPACE_TITLE,
    description: 'For testing About Space owner section',
    color: 'lovely-lavender',
    createdAt: now,
    updatedAt: now,
    userId: FAKE_OWNER_ID,
    isPublic: true,
    isActive: true,
    order: 0,
    shareToken: 'mock_share_token_1',
    shareTokenCreatedAt: now,
  });

  // 3. Membership: ensure current user is member (delete then insert for idempotency)
  await db
    .delete(Members)
    .where(eq(Members.spaceId, SPACE_ID));

  await db.insert(Members).values({
    id: `member_${SPACE_ID}_${memberClerkId}`,
    userId: memberClerkId,
    spaceId: SPACE_ID,
    role: 'member',
    createdAt: now,
    joinedAt: now,
  });

  console.log(`Mock shared space ready: ${SPACE_ID} ("${SPACE_TITLE}"). Owner: Mock Owner. You (${memberClerkId}) are a member. Open the space and tap About Space to see "Created by Mock O. on ...".`);
}

main().catch((err) => {
  console.error('seed-mock-shared-space failed:', err);
  process.exit(1);
});
