/**
 * GET /api/navigation/data
 *
 * Returns threads, spaces, memberOf spaces, and inbox count
 * for populating the navigation sidebar.
 *
 * Port of: src/pages/api/navigation/data.ts
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import { getCachedUserData } from '../utils/user-cache';
import { getAllThreadsWithCounts, getSpacesWithCounts, getInboxDisplayCount, getMemberOfSpaces, getThreadNoteTypeCounts } from '../utils/dashboard-data';
import { getThreadGradientCSS } from '@/utils/colors';
import { handleAPIError } from '@/utils/error-handling';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';

const route = new Hono();

route.get('/api/navigation/data', async (c) => {
  try {
    const auth = getAuth(c);
    const { userId } = auth;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Ensure user cache (and onboarding thread for new users) exists before reading thread list,
    // so the first load shows onboarding without a refresh.
    await getCachedUserData(userId);

    // Fetch navigation data in parallel
    const [threads, spaces, inboxCount, unorganizedThreadData, unorganizedTypeCounts, memberSpaces] = await Promise.all([
      getAllThreadsWithCounts(userId),
      getSpacesWithCounts(userId),
      getInboxDisplayCount(userId),
      ensureUnorganizedThread(userId),
      getThreadNoteTypeCounts('thread_unorganized', userId),
      getMemberOfSpaces(userId),
    ]);

    // Ensure threads and spaces have backgroundGradient property
    const threadsWithGradients = threads.map(thread => ({
      ...thread,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || 'blue'),
    }));

    // Always include unorganized thread in the threads array (even if count is 0)
    const now = new Date().toISOString();
    threadsWithGradients.push({
      id: 'thread_unorganized',
      title: 'Unorganized',
      subtitle: "Notes that haven't been organized into threads yet" as string | null,
      color: null,
      spaceId: null,
      isPublic: true,
      isPinned: false,
      createdAt: now,
      updatedAt: now as string | null,
      lastVisited: null,
      noteCount: unorganizedTypeCounts?.all || unorganizedThreadData.noteCount || 0,
      lastUpdated: now,
      accentColor: getThreadGradientCSS('paper'),
      backgroundGradient: unorganizedThreadData.backgroundGradient || getThreadGradientCSS('paper'),
    });

    const spacesWithGradients = spaces.map(space => ({
      ...space,
      backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper'),
    }));

    const memberSpacesWithGradients = memberSpaces.map(space => ({
      ...space,
      backgroundGradient: getThreadGradientCSS(space.color || 'paper'),
    }));

    return c.json(
      {
        threads: threadsWithGradients,
        spaces: spacesWithGradients,
        memberOfSpaces: memberSpacesWithGradients,
        inboxCount,
      },
      200,
      { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    );
  } catch (error) {
    try {
      const standardError = handleAPIError(error, {
        endpoint: '/api/navigation/data',
        action: 'get_navigation_data',
      });
      const body = {
        error: standardError.message,
        code: standardError.code,
        details: error instanceof Error ? error.message : String(error),
        hint: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') ?? '' : '',
      };
      return c.json(body, 500, { 'Content-Type': 'application/json' });
    } catch (fallbackErr) {
      console.error('[api/navigation/data] Fallback error:', fallbackErr);
      return c.json(
        { error: 'Navigation failed', details: String(fallbackErr) },
        500,
        { 'Content-Type': 'application/json' },
      );
    }
  }
});

export default route;
