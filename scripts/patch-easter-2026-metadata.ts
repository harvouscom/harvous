/**
 * Apply Easter 2026 display metadata to an existing admin-owned space + thread in the DB.
 *
 * Repo-only edits to publish-payload.json do NOT update Supabase — run this after changing copy.
 *
 * Requires: .env with SUPABASE_DATABASE_URL, HARVOUS_SYSTEM_USER_ID
 *
 * Usage:
 *   EASTER_PATCH_SPACE_ID=space_xxx EASTER_PATCH_THREAD_ID=thread_yyy npx tsx scripts/patch-easter-2026-metadata.ts
 *
 * Optional:
 *   EASTER_PATCH_FEATURED_ID=uuid  — updates featured card title/description to match payload
 */
import 'dotenv/config';
import { db, Spaces, Threads, FeaturedItems } from '../server/db';
import { eq, and } from 'drizzle-orm';
import { nowISO } from '../server/db/dates';
import { getThreadGradientCSS } from '../src/utils/colors';

const SPACE_TITLE = 'Easter 2026';
const SPACE_COLOR = 'purple' as const;
const THREAD_TITLE = 'When the tomb was empty';
const THREAD_SUBTITLE = 'Hope for every heart';
const THREAD_COLOR = 'purple' as const;
const FEATURED_TITLE = 'Join Easter 2026';
const FEATURED_DESCRIPTION =
  'Hope for every heart—walk through the resurrection together. New to Jesus or walking with Him for years. Open the card to join.';

async function main() {
  const systemUserId = process.env.HARVOUS_SYSTEM_USER_ID;
  const spaceId = process.env.EASTER_PATCH_SPACE_ID?.trim();
  const threadId = process.env.EASTER_PATCH_THREAD_ID?.trim();
  const featuredId = process.env.EASTER_PATCH_FEATURED_ID?.trim();

  if (!systemUserId) {
    console.error('Missing HARVOUS_SYSTEM_USER_ID in .env');
    process.exit(1);
  }
  if (!spaceId || !threadId) {
    console.error('Set EASTER_PATCH_SPACE_ID and EASTER_PATCH_THREAD_ID (see docs/easter-2026-shared-space/EXAMPLE_PUBLISH_OUTPUT.json)');
    process.exit(1);
  }

  const spaceRow = await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, systemUserId))).limit(1);
  if (spaceRow.length === 0) {
    console.error(`Space ${spaceId} not found or not owned by HARVOUS_SYSTEM_USER_ID`);
    process.exit(1);
  }

  const threadRow = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, systemUserId))).limit(1);
  if (threadRow.length === 0) {
    console.error(`Thread ${threadId} not found or not owned by HARVOUS_SYSTEM_USER_ID`);
    process.exit(1);
  }

  const spaceTitle = SPACE_TITLE.charAt(0).toUpperCase() + SPACE_TITLE.slice(1);
  const threadTitle = THREAD_TITLE.trim().charAt(0).toUpperCase() + THREAD_TITLE.trim().slice(1);

  console.log('Before — space title:', spaceRow[0].title, '| thread title:', threadRow[0].title);

  await db
    .update(Spaces)
    .set({
      title: spaceTitle,
      color: SPACE_COLOR,
      backgroundGradient: getThreadGradientCSS(SPACE_COLOR),
      updatedAt: nowISO(),
    })
    .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, systemUserId)));

  await db
    .update(Threads)
    .set({
      title: threadTitle,
      subtitle: THREAD_SUBTITLE,
      color: THREAD_COLOR,
      updatedAt: nowISO(),
    })
    .where(and(eq(Threads.id, threadId), eq(Threads.userId, systemUserId)));

  console.log('After  — space title:', spaceTitle, SPACE_COLOR);
  console.log('After  — thread title:', threadTitle, '| subtitle:', THREAD_SUBTITLE, THREAD_COLOR);
  console.log('Reload the thread page (hard refresh) so the browser drops any old cached API response.');

  if (featuredId) {
    await db
      .update(FeaturedItems)
      .set({
        title: FEATURED_TITLE,
        description: FEATURED_DESCRIPTION,
        updatedAt: nowISO(),
      })
      .where(eq(FeaturedItems.id, featuredId));
    console.log('Updated featured item:', featuredId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
