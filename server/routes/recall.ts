/**
 * POST /api/recall/event — record Home recall carousel open or snooze.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { recordRecallEvent, validateRecallEventInput } from '../utils/record-recall-event';

const route = new Hono();

route.post('/api/recall/event', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const input = validateRecallEventInput(body);
    if (!input) {
      return c.json({ error: 'Invalid recall event payload' }, 400);
    }

    await recordRecallEvent(auth.userId, input);
    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/recall/event', action: 'recall_event' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
