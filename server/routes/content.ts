/**
 * Content routes — Hono port of src/pages/api/content/load-more.ts
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
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

    const offset = parseInt(c.req.query('offset') || '0', 10);
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const filter = c.req.query('filter') || 'all';

    // Optimized path for scripture filter - query directly from database
    if (filter === 'scripture') {
      const { items, hasMore } = await getScriptureNotesForDashboard(auth.userId, limit, offset);
      return c.json({ items, hasMore, offset, limit });
    }

    // For other filters, use the existing getContentItems function
    const fetchLimit = filter === 'all' ? limit : limit * 3;
    const filterExcludeReferencedScripture = filter === 'all';

    const items = await getContentItems(auth.userId, fetchLimit, offset, filterExcludeReferencedScripture);

    // For 'all' filter on initial load (offset === 0), also fetch referenced scripture notes without lastVisited
    let referencedScriptureNotes: any[] = [];
    if (filter === 'all' && offset === 0) {
      referencedScriptureNotes = await getReferencedScriptureNotesWithoutLastVisited(auth.userId);
    }

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
      referencedScriptureNotes: filter === 'all' && offset === 0 ? referencedScriptureNotes : undefined,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error loading more content:', err);
    if (err.stack) console.error('Error stack:', err.stack);
    return c.json({ error: 'Failed to load more content', details: err.message }, 500);
  }
});

export default route;
