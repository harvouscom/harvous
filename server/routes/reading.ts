/**
 * POST /api/reading/event   — record one chapter reading session.
 * GET  /api/reading/recent  — read back which chapters have been read, for continue-reading.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import {
  collapseReadingHistory,
  recordReadingEvent,
  validateReadingEventInput,
} from '../utils/record-reading-event';
import { db, ReadingEvents, and, eq, gte, desc } from '../db';
import { isReadingEventsTableMissing } from '../utils/pg-undefined-relation';

const route = new Hono();

/**
 * Longer than the recall history window, which only has to outlive a snooze. Continue-reading
 * is asking where someone is in a book, and working through a book takes months — a 21-day
 * window would keep proposing chapter 1 of something they are halfway through.
 */
const READING_HISTORY_WINDOW_DAYS = 180;
const READING_HISTORY_MAX_ROWS = 1000;

route.post('/api/reading/event', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const input = validateReadingEventInput(body);
    if (!input) {
      return c.json({ error: 'Invalid reading event payload', code: 'READING_EVENT_INVALID' }, 400);
    }

    await recordReadingEvent(auth.userId, input);
    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/reading/event',
      action: 'reading_event',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * Which chapters have been read, collapsed to one entry each.
 *
 * Read separately from the note index on purpose: every other signal Home has about
 * Scripture comes from what was written about it, so a chapter someone read and never
 * noted is invisible. This is the half that sees it.
 */
route.get('/api/reading/recent', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    // ReadingEvents.createdAt is a timestamp column, so compare against a Date.
    const since = new Date(Date.now() - READING_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        book: ReadingEvents.book,
        bookOrder: ReadingEvents.bookOrder,
        chapter: ReadingEvents.chapter,
        dwellBucket: ReadingEvents.dwellBucket,
        createdAt: ReadingEvents.createdAt,
      })
      .from(ReadingEvents)
      .where(and(eq(ReadingEvents.userId, auth.userId), gte(ReadingEvents.createdAt, since)))
      .orderBy(desc(ReadingEvents.createdAt))
      .limit(READING_HISTORY_MAX_ROWS);

    return c.json({ success: true, chapters: collapseReadingHistory(rows) });
  } catch (error) {
    // Pre-migration databases have no ReadingEvents table. Continue-reading is an
    // enhancement, so degrade to "nothing read yet" rather than failing Home's data load.
    if (isReadingEventsTableMissing(error)) {
      return c.json({ success: true, chapters: [] });
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/reading/recent',
      action: 'reading_recent',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
