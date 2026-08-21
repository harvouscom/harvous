/**
 * POST /api/recall/event        — record Home recall carousel open or snooze.
 * GET  /api/recall/events/recent — read back recent opens/snoozes for suppression.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import {
  collapseRecallHistory,
  recordRecallEvent,
  validateRecallEventInput,
} from '../utils/record-recall-event';
import { db, RecallEvents, and, eq, gte, inArray, desc } from '../db';
import { isRecallEventsTableMissing } from '../utils/pg-undefined-relation';

const route = new Hono();

/** Matches the longest client-side cooldown window, so nothing suppressible is missed. */
const RECALL_HISTORY_WINDOW_DAYS = 21;
const RECALL_HISTORY_MAX_ROWS = 500;

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

/**
 * Recent opens and snoozes, so a recommendation acted on (or dismissed) on one device
 * stops resurfacing on the others. The client already keeps a localStorage cooldown; this
 * is the cross-device half, merged with it rather than replacing it so the feature still
 * works offline.
 *
 * Note RecallEvents has no spaceId while the client store is space-scoped. Home only runs
 * in the personal space today, so user-scoped history is a correct superset. Shipping
 * recall inside shared spaces would require a spaceId column here.
 */
route.get('/api/recall/events/recent', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    // RecallEvents.createdAt is a timestamp column, so compare against a Date.
    const since = new Date(Date.now() - RECALL_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        opportunityId: RecallEvents.opportunityId,
        action: RecallEvents.action,
        createdAt: RecallEvents.createdAt,
      })
      .from(RecallEvents)
      .where(
        and(
          eq(RecallEvents.userId, auth.userId),
          // The three that suppress. `impression` is excluded here rather than filtered later
          // so the row cap is spent on events that can actually change what the shelf offers.
          inArray(RecallEvents.action, ['open', 'snooze', 'complete']),
          gte(RecallEvents.createdAt, since),
        ),
      )
      .orderBy(desc(RecallEvents.createdAt))
      .limit(RECALL_HISTORY_MAX_ROWS);

    return c.json({ success: true, events: collapseRecallHistory(rows) });
  } catch (error) {
    // Pre-migration databases have no RecallEvents table. Suppression is an enhancement,
    // so degrade to "no history" rather than failing Home's data load.
    if (isRecallEventsTableMissing(error)) {
      return c.json({ success: true, events: [] });
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/recall/events/recent',
      action: 'recall_events_recent',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
