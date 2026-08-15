/**
 * POST /api/reading/event    — record that a chapter was read, and move the bookmark.
 * GET  /api/reading/position — where reading left off, for Home's "continue" card.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { recordReadingEvent, validateReadingEventInput } from '../utils/record-reading-event';
import { db, UserMetadata, eq, first } from '../db';
import { parseReadingPosition } from '@/utils/reading-position';
import { isLastReadPositionColumnMissing } from '../utils/pg-undefined-relation';

const route = new Hono();

/**
 * Answers `{ success: true }` whether or not anything was written.
 *
 * The reader fires this and forgets it; there is nothing it could usefully do with a failure,
 * and a 500 here would surface as a console error on a page whose whole job is to be quiet.
 * Genuine failures are logged server-side, where someone can act on them.
 */
route.post('/api/reading/event', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const input = validateReadingEventInput(body);
    if (!input) {
      return c.json({ error: 'Invalid reading event payload' }, 400);
    }

    const recorded = await recordReadingEvent(auth.userId, input);
    return c.json({ success: true, recorded });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/reading/event',
      action: 'reading_event',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * The bookmark. `{ position: null }` for someone who has not read in-app yet — which is a real
 * answer, not an error, and is what Home shows its first-run card for.
 */
route.get('/api/reading/position', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const row = first(
      await db
        .select({ lastReadPosition: UserMetadata.lastReadPosition })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, auth.userId))
        .limit(1),
    );

    return c.json({ position: parseReadingPosition(row?.lastReadPosition ?? null) });
  } catch (error) {
    // Before the migration lands, "no bookmark" is the truth rather than a failure.
    if (isLastReadPositionColumnMissing(error)) {
      return c.json({ position: null });
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/reading/position',
      action: 'reading_position',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
