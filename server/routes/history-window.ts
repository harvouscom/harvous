/**
 * GET /api/user/history-window — what a free account's history window is hiding, and what
 * leaves it next. Drives the Home trail's "leaves your history in N days" line, the weekly
 * reminder toast, and the count on the trail's "Earlier study" edge.
 *
 * Plus (`full_history`) answers `{ fullHistory: true }` and nothing else. Read-only.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { hasFeatureWithReconcile } from '../middleware/require-feature';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { freeHistoryWindowStatus } from '../utils/history-window-status';

const route = new Hono();

route.get('/api/user/history-window', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const hasFullHistory = await hasFeatureWithReconcile(auth, 'full_history', { throttle: true });
    // Five minutes: the window moves by the day, and a fresh upgrade invalidates on the client.
    const headers = { 'Cache-Control': 'private, max-age=300' };
    if (hasFullHistory) return c.json({ fullHistory: true }, 200, headers);
    return c.json({ fullHistory: false, ...(await freeHistoryWindowStatus(auth.userId)) }, 200, headers);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/user/history-window', action: 'history_window' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
