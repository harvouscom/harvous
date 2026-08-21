/**
 * POST /api/recall/event        — record a Home recall carousel event.
 * GET  /api/recall/events/recent — read back history for suppression.
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
import {
  RECALL_UNBOUNDED_ACTIONS,
} from '@/utils/recall-opportunity-kinds';
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

/**
 * A separate, unwindowed budget for the actions that never expire.
 *
 * `dismissed` and `restored` cannot be fetched by the window above: a dismissal is the reader
 * saying "never show me this again", and dropping it out of the response on its 32nd day would
 * hand that suggestion straight back. So they are read by a second query with no time bound.
 *
 * Bounded by count instead, and by a bigger number than the windowed query, because the failure
 * here is worse. Falling off the windowed list costs a few days of extra suppression; falling
 * off this one breaks a promise. Newest-first, so if a reader ever does exceed it, the ones
 * lost are the oldest — and a dismissal from years ago is the likeliest to have gone stale.
 */
const RECALL_PERMANENT_MAX_ROWS = 2000;

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

    const columns = {
      opportunityId: RecallEvents.opportunityId,
      action: RecallEvents.action,
      createdAt: RecallEvents.createdAt,
    };

    /*
     * Two queries, because the actions have two different lifetimes.
     *
     * The windowed one covers everything that expires. `impression` is excluded here rather
     * than filtered later so the row cap is spent on events that can actually change what the
     * shelf offers.
     */
    const [windowed, permanent] = await Promise.all([
      db
        .select(columns)
        .from(RecallEvents)
        .where(
          and(
            eq(RecallEvents.userId, auth.userId),
            inArray(RecallEvents.action, ['open', 'snooze', 'complete']),
            gte(RecallEvents.createdAt, since),
          ),
        )
        .orderBy(desc(RecallEvents.createdAt))
        .limit(RECALL_HISTORY_MAX_ROWS),
      // ...and the unwindowed one covers the two that do not expire. See
      // RECALL_PERMANENT_MAX_ROWS for why this cannot share the window above.
      db
        .select(columns)
        .from(RecallEvents)
        .where(
          and(
            eq(RecallEvents.userId, auth.userId),
            inArray(RecallEvents.action, [...RECALL_UNBOUNDED_ACTIONS]),
          ),
        )
        .orderBy(desc(RecallEvents.createdAt))
        .limit(RECALL_PERMANENT_MAX_ROWS),
    ]);

    /*
     * Merged newest-first before collapsing, because `collapseRecallHistory` keeps the first
     * row it sees for each (opportunity, action) and trusts the caller for the ordering. The
     * two queries are each sorted but their concatenation is not.
     */
    const rows = [...windowed, ...permanent].sort((a, b) => {
      const at = a.createdAt instanceof Date ? a.createdAt.getTime() : Date.parse(String(a.createdAt));
      const bt = b.createdAt instanceof Date ? b.createdAt.getTime() : Date.parse(String(b.createdAt));
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    });

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
