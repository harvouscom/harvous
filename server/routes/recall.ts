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

/**
 * Covers the longest client-side cooldown window, so nothing suppressible is missed.
 *
 * One day of headroom past the longest window (`RECALL_COMPLETED_COOLDOWN_DAYS`, 30) rather than
 * exactly equal to it, so a row is not dropped by clock skew on the boundary day. This was 21 —
 * correct when the longest window was `RECALL_COOLDOWN_DAYS`, and quietly wrong once completions
 * started resting for 30: a completion aged 21-30 days was never returned, so finishing something
 * on a laptop stopped suppressing it on a phone. Keep this above every window in
 * `spa/src/pages/prototype/proto-recall-cooldown.ts`.
 */
export const RECALL_HISTORY_WINDOW_DAYS = 31;
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
