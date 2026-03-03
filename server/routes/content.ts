/**
 * Content routes — Hono port of src/pages/api/content/load-more.ts
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import { getCachedUserData, ensureOnboardingThreadIfMissing } from '../utils/user-cache';
import {
  getContentItems,
  getScriptureNotesForDashboard,
  getReferencedScriptureNotesWithoutLastVisited,
} from '../utils/dashboard-data';

const route = new Hono();

route.get('/api/content/load-more', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) {
      console.log('[api/content/load-more] No auth userId — returning 401');
      return c.json({ error: 'Authentication required' }, 401);
    }
    console.log('[api/content/load-more] auth.userId', auth.userId);

    // Ensure user cache (and onboarding thread for new users) exists before reading content,
    // so the first load shows onboarding without a refresh.
    await getCachedUserData(auth.userId);

    const offset = parseInt(c.req.query('offset') || '0', 10);
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const filter = c.req.query('filter') || 'all';

    // For first page of "all", ensure onboarding (and scripture refs) exist in this request so junction is populated before getContentItems reads it
    if (offset === 0 && filter === 'all') {
      await ensureOnboardingThreadIfMissing(auth.userId);
    }

    // Optimized path for scripture filter - query directly from database
    if (filter === 'scripture') {
      const { items, hasMore } = await getScriptureNotesForDashboard(auth.userId, limit, offset);
      return c.json({ items, hasMore, offset, limit });
    }

    // For other filters, use the existing getContentItems function
    const fetchLimit = filter === 'all' ? limit : limit * 3;
    const filterExcludeReferencedScripture = filter === 'all';
    const needReferencedScripture = filter === 'all' && offset === 0;

    const [items, referencedScriptureNotes] = needReferencedScripture
      ? await Promise.all([
          getContentItems(auth.userId, fetchLimit, offset, filterExcludeReferencedScripture),
          getReferencedScriptureNotesWithoutLastVisited(auth.userId),
        ])
      : [await getContentItems(auth.userId, fetchLimit, offset, filterExcludeReferencedScripture), [] as any[]];

    // Filter by type if needed
    let filteredItems = items;
    if (filter === 'threads') {
      filteredItems = items.filter((item: any) => item.type === 'thread');
    } else if (filter === 'notes') {
      filteredItems = items.filter((item: any) => item.type === 'note' && (item.noteType === 'default' || !item.noteType));
    } else if (filter === 'resources') {
      filteredItems = items.filter((item: any) => item.type === 'note' && item.noteType === 'resource');
    }

    // Take only the requested limit
    const limitedItems = filteredItems.slice(0, limit);

    // Check if there are more items
    const hasMore = limitedItems.length === limit && (items.length === fetchLimit || filteredItems.length > limit);

    console.log('[api/content/load-more] items count', { returned: limitedItems.length, rawCount: items.length, filter, offset, limit });

    return c.json({
      items: limitedItems,
      hasMore,
      offset,
      limit,
      referencedScriptureNotes: needReferencedScripture ? referencedScriptureNotes : undefined,
    });
  } catch (error: unknown) {
    try {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[api/content/load-more] Error:', err.message, err.stack);
      const body = {
        error: 'Failed to load more content',
        details: err.message,
        hint: (err as Error).stack?.split('\n').slice(0, 3).join(' | ') ?? '',
      };
      return c.json(body, 500, { 'Content-Type': 'application/json' });
    } catch (fallbackErr) {
      console.error('[api/content/load-more] Fallback error:', fallbackErr);
      return c.json(
        { error: 'Failed to load more content', details: String(fallbackErr) },
        500,
        { 'Content-Type': 'application/json' },
      );
    }
  }
});

export default route;
