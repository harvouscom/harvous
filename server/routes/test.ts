/**
 * Test routes — Hono port of src/pages/api/test/*.ts
 *
 * Endpoints:
 *   POST /api/test/reset-to-new-user — Clear all current user data + UserMetadata so
 *        on refresh the app treats them as new and creates only the onboarding thread.
 *        Dev only. No auth required: pass { "userId": "user_xxx" } in body, or omit to use session.
 *   POST /api/test/seed-sample-votd — Dev only; inserts a Verse of the Day featured row active for
 *        today (UTC) so you can exercise the VOTD card without admin schedule + publish-daily.
 *   POST /api/test/seed-sample-featured — Dev only; seeds VOTD plus sample space, thread, recall,
 *        challenge, and church featured cards (dashboard carousel). Response includes featuredItemIds
 *        for clearing localStorage dismissed_featured_* keys.
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import { resetUserToNew } from '../utils/reset-user-to-new';
import { db, eq, inArray } from '../db';
import { now } from '../db/dates';
import { FeaturedItems, UserFeaturedItems, VotdSchedule } from '../db/schema';

/** Stable IDs so re-seeding replaces the same row (no duplicate sample cards). */
const SAMPLE_VOTD_SCHEDULE_ID = 'votd_dev_sample';
const SAMPLE_VOTD_FEATURED_ID = 'votd_fi_dev_sample';

const SAMPLE_FEATURED_SPACE_ID = 'fi_dev_sample_space';
const SAMPLE_FEATURED_THREAD_ID = 'fi_dev_sample_thread';
const SAMPLE_FEATURED_RECALL_ID = 'fi_dev_sample_recall';
const SAMPLE_FEATURED_CHALLENGE_ID = 'fi_dev_sample_challenge';
const SAMPLE_FEATURED_CHURCH_ID = 'fi_dev_sample_church';

/** All non-VOTD sample featured rows (VOTD uses its own id above). */
const SAMPLE_FEATURED_CAROUSEL_IDS = [
  SAMPLE_FEATURED_SPACE_ID,
  SAMPLE_FEATURED_THREAD_ID,
  SAMPLE_FEATURED_RECALL_ID,
  SAMPLE_FEATURED_CHALLENGE_ID,
  SAMPLE_FEATURED_CHURCH_ID,
] as const;

const ALL_SAMPLE_FEATURED_IDS = [SAMPLE_VOTD_FEATURED_ID, ...SAMPLE_FEATURED_CAROUSEL_IDS] as const;

const app = new Hono();

/** POST /api/test/reset-to-new-user — dev only, auth bypassed; optional body: { userId } */
app.post('/api/test/reset-to-new-user', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Test endpoint not available in production' }, 403);
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as { userId?: string };
    const auth = getAuth(c);
    const userId = body.userId ?? auth.userId ?? null;
    if (!userId) {
      return c.json(
        { error: 'Provide userId in request body (e.g. { "userId": "user_xxx" }) or be logged in' },
        400
      );
    }

    await resetUserToNew(userId);
    console.log(`✅ Reset user ${userId} to new-user state (all content cleared)`);

    return c.json({
      success: true,
      message: 'All your data was cleared. Refresh the page to see the onboarding experience (like a new user).'
    });
  } catch (error: any) {
    console.error('Reset to new user error:', error);
    return c.json({ error: error.message || 'Failed to reset user' }, 500);
  }
});

/** POST /api/test/reset-featured — dev only; clears UserFeaturedItems for the current user so featured cards reappear */
app.post('/api/test/reset-featured', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Test endpoint not available in production' }, 403);
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as { userId?: string };
    const auth = getAuth(c);
    const userId = body.userId ?? auth.userId ?? null;
    if (!userId) {
      return c.json(
        { error: 'Provide userId in request body (e.g. { "userId": "user_xxx" }) or be logged in' },
        400
      );
    }

    await db.delete(UserFeaturedItems).where(eq(UserFeaturedItems.userId, userId));
    console.log(`✅ Cleared UserFeaturedItems for ${userId}`);

    return c.json({ success: true, message: 'Featured item dismissals cleared. Featured cards will reappear on next load.' });
  } catch (error: any) {
    console.error('Reset featured error:', error);
    return c.json({ error: error.message || 'Failed to reset featured items' }, 500);
  }
});

/** POST /api/test/seed-sample-votd — dev only; idempotent sample VOTD for UI / quick-add testing */
app.post('/api/test/seed-sample-votd', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Test endpoint not available in production' }, 403);
  }

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const reference = 'John 3:16';
    const translation = 'NET';
    const versePlain =
      'For this is the way God loved the world: He gave his one and only Son that everyone who believes in him should not perish but have eternal life.';

    await db.delete(UserFeaturedItems).where(eq(UserFeaturedItems.featuredItemId, SAMPLE_VOTD_FEATURED_ID));
    await db.delete(FeaturedItems).where(eq(FeaturedItems.id, SAMPLE_VOTD_FEATURED_ID));
    await db.delete(VotdSchedule).where(eq(VotdSchedule.id, SAMPLE_VOTD_SCHEDULE_ID));

    const timestamp = now();
    const metadata = {
      reference,
      translation,
      verseText: `<p>${versePlain}</p>`,
      book: 'John',
      chapter: 3,
      verse: 16,
      verseEnd: null as number | null,
    };

    await db.insert(VotdSchedule).values({
      id: SAMPLE_VOTD_SCHEDULE_ID,
      reference,
      translation,
      verseText: metadata.verseText,
      book: metadata.book,
      chapter: metadata.chapter,
      verse: metadata.verse,
      verseEnd: null,
      scheduledDate: todayStr,
      isPublished: true,
      featuredItemId: SAMPLE_VOTD_FEATURED_ID,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(FeaturedItems).values({
      id: SAMPLE_VOTD_FEATURED_ID,
      contentType: 'votd',
      title: reference,
      description: versePlain.length > 280 ? `${versePlain.slice(0, 280)}…` : versePlain,
      refId: SAMPLE_VOTD_SCHEDULE_ID,
      shareToken: null,
      color: null,
      isActive: true,
      startsAt: todayStart,
      endsAt: tomorrowStart,
      metadata: JSON.stringify(metadata),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    console.log(`✅ Seeded sample VOTD (${SAMPLE_VOTD_FEATURED_ID}) active ${todayStr} UTC`);

    return c.json({
      success: true,
      featuredItemId: SAMPLE_VOTD_FEATURED_ID,
      featuredItemIds: [SAMPLE_VOTD_FEATURED_ID],
      message:
        'Sample Verse of the Day is active for today (UTC). Refresh the dashboard. If it still does not show: POST /api/test/reset-featured (clears server dismissals) and remove localStorage key dismissed_featured_votd_fi_dev_sample if present.',
    });
  } catch (error: any) {
    console.error('Seed sample VOTD error:', error);
    return c.json({ error: error.message || 'Failed to seed sample VOTD' }, 500);
  }
});

/** POST /api/test/seed-sample-featured — dev only; VOTD + all other featured card types for UI testing */
app.post('/api/test/seed-sample-featured', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Test endpoint not available in production' }, 403);
  }

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const reference = 'John 3:16';
    const translation = 'NET';
    const versePlain =
      'For this is the way God loved the world: He gave his one and only Son that everyone who believes in him should not perish but have eternal life.';

    await db.delete(UserFeaturedItems).where(inArray(UserFeaturedItems.featuredItemId, [...ALL_SAMPLE_FEATURED_IDS]));
    await db.delete(FeaturedItems).where(inArray(FeaturedItems.id, [...ALL_SAMPLE_FEATURED_IDS]));
    await db.delete(VotdSchedule).where(eq(VotdSchedule.id, SAMPLE_VOTD_SCHEDULE_ID));

    const t0 = now().getTime();
    const ts = (offsetMs: number) => new Date(t0 + offsetMs);

    const metadata = {
      reference,
      translation,
      verseText: `<p>${versePlain}</p>`,
      book: 'John',
      chapter: 3,
      verse: 16,
      verseEnd: null as number | null,
    };

    const timestamp = now();

    await db.insert(VotdSchedule).values({
      id: SAMPLE_VOTD_SCHEDULE_ID,
      reference,
      translation,
      verseText: metadata.verseText,
      book: metadata.book,
      chapter: metadata.chapter,
      verse: metadata.verse,
      verseEnd: null,
      scheduledDate: todayStr,
      isPublished: true,
      featuredItemId: SAMPLE_VOTD_FEATURED_ID,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Oldest first so desc(createdAt) shows VOTD on top (inserted last).
    await db.insert(FeaturedItems).values([
      {
        id: SAMPLE_FEATURED_SPACE_ID,
        contentType: 'space',
        title: 'Sample featured space',
        description: 'Dev-only card — join link is not a real space (UI testing).',
        refId: null,
        shareToken: 'dev_sample_space_join',
        color: 'blue',
        isActive: true,
        startsAt: todayStart,
        endsAt: tomorrowStart,
        metadata: null,
        createdAt: ts(-50_000),
        updatedAt: ts(-50_000),
      },
      {
        id: SAMPLE_FEATURED_THREAD_ID,
        contentType: 'thread',
        title: 'Sample shared thread',
        description: 'Dev-only card — share link is not a real thread (UI testing).',
        refId: null,
        shareToken: 'dev_sample_thread_share',
        color: 'purple',
        isActive: true,
        startsAt: todayStart,
        endsAt: tomorrowStart,
        metadata: null,
        createdAt: ts(-40_000),
        updatedAt: ts(-40_000),
      },
      {
        id: SAMPLE_FEATURED_RECALL_ID,
        contentType: 'recall',
        title: 'Sample recall card',
        description: 'Tap Review now to exercise the recall featured layout.',
        refId: null,
        shareToken: null,
        color: null,
        isActive: true,
        startsAt: todayStart,
        endsAt: tomorrowStart,
        metadata: null,
        createdAt: ts(-30_000),
        updatedAt: ts(-30_000),
      },
      {
        id: SAMPLE_FEATURED_CHALLENGE_ID,
        contentType: 'challenge',
        title: 'Sample challenge card',
        description: 'Dev-only challenge promo line for carousel styling.',
        refId: null,
        shareToken: null,
        color: null,
        isActive: true,
        startsAt: todayStart,
        endsAt: tomorrowStart,
        metadata: null,
        createdAt: ts(-20_000),
        updatedAt: ts(-20_000),
      },
      {
        id: SAMPLE_FEATURED_CHURCH_ID,
        contentType: 'church',
        title: 'Sample church card',
        description: 'Dev-only church featured row.',
        refId: null,
        shareToken: null,
        color: null,
        isActive: true,
        startsAt: todayStart,
        endsAt: tomorrowStart,
        metadata: null,
        createdAt: ts(-10_000),
        updatedAt: ts(-10_000),
      },
      {
        id: SAMPLE_VOTD_FEATURED_ID,
        contentType: 'votd',
        title: reference,
        description: versePlain.length > 280 ? `${versePlain.slice(0, 280)}…` : versePlain,
        refId: SAMPLE_VOTD_SCHEDULE_ID,
        shareToken: null,
        color: null,
        isActive: true,
        startsAt: todayStart,
        endsAt: tomorrowStart,
        metadata: JSON.stringify(metadata),
        createdAt: ts(0),
        updatedAt: ts(0),
      },
    ]);

    console.log(`✅ Seeded sample featured carousel (${ALL_SAMPLE_FEATURED_IDS.length} items) active ${todayStr} UTC`);

    return c.json({
      success: true,
      featuredItemIds: [...ALL_SAMPLE_FEATURED_IDS],
      dismissLocalStorageKeys: [...ALL_SAMPLE_FEATURED_IDS].map((id) => `dismissed_featured_${id}`),
      message:
        'Sample featured carousel is active for today (UTC). Clear dismissLocalStorageKeys in localStorage (or use the snippet in docs), then reload. Use POST /api/test/reset-featured if cards stay hidden server-side.',
    });
  } catch (error: any) {
    console.error('Seed sample featured error:', error);
    return c.json({ error: error.message || 'Failed to seed sample featured items' }, 500);
  }
});

export default app;
