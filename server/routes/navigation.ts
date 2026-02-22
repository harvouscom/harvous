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
import { getAllThreadsWithCounts, getSpacesWithCounts, getInboxDisplayCount, getMemberOfSpaces } from '../utils/dashboard-data';
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

    // Fetch navigation data in parallel
    const [threads, spaces, inboxCount, unorganizedThreadData, memberSpaces] = await Promise.all([
      getAllThreadsWithCounts(userId),
      getSpacesWithCounts(userId),
      getInboxDisplayCount(userId),
      ensureUnorganizedThread(userId),
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
      subtitle: "Notes that haven't been organized into threads yet",
      color: null,
      spaceId: null,
      isPublic: true,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      noteCount: unorganizedThreadData.noteCount || 0,
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
      totalItemCount: 0,
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
    const standardError = handleAPIError(error, {
      endpoint: '/api/navigation/data',
      action: 'get_navigation_data',
    });
    return c.json(
      { error: standardError.message, code: standardError.code },
      500,
    );
  }
});

export default route;
