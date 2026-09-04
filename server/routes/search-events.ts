/**
 * POST   /api/search/event          — record a committed search, or a result opened from one.
 * GET    /api/search/events/recent  — read it back, for the unanswered-question card.
 * DELETE /api/search/history        — forget every search this reader has made.
 *
 * The write is deliberately not done inside `/api/search` itself, which would look free and
 * would be wrong: that endpoint is called once per settled debounce, so it sees "pat",
 * "patie" and "patience" on the way to one search. Deciding which of those was a real query
 * needs the field's live value, which only the client has. See `use-library-search-history`.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import {
  deleteSearchEventsForUser,
  getRecentSearchEvents,
  recordSearchEvent,
  validateSearchEventInput,
} from '../utils/record-search-event';

const route = new Hono();

route.post('/api/search/event', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const input = validateSearchEventInput(body);
    if (!input) {
      /* Covers both a malformed payload and a well-formed query this table has chosen not to
         keep. The client is fire-and-forget either way and never reads this. */
      return c.json({ error: 'Invalid search event payload' }, 400);
    }

    await recordSearchEvent(auth.userId, input);
    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/search/event',
      action: 'search_event',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * The reader's own recent searches, inside the retention window.
 *
 * Raw rows rather than a computed answer, because the gating that turns these into a card
 * counts occurrences across *distinct local days* — and the server does not know the reader's
 * timezone. `server/routes/study-feed.ts` splits the same way and for the same reason: the
 * merge is server work, the day boundaries are client work.
 */
route.get('/api/search/events/recent', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const events = await getRecentSearchEvents(auth.userId);
    return c.json({ events });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/search/events/recent',
      action: 'search_events_recent',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * A real delete, not a tombstone.
 *
 * The settings control promises to clear the history rather than to stop showing it, and a
 * history control that only clears the device is not a history control.
 */
route.delete('/api/search/history', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    await deleteSearchEventsForUser(auth.userId);
    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/search/history',
      action: 'search_history_delete',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
