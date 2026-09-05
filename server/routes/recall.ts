/**
 * POST /api/recall/event        — record a Home recall carousel event.
 * POST /api/recall/events       — the same, for a set of them that arrived together.
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
  resolveRecallRoomScope,
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

/**
 * Ceiling on one batch.
 *
 * The carousel sends an impression per card on screen, so a real batch is single digits; this
 * is only here so a malformed or hostile body cannot turn one authenticated request into an
 * unbounded run of inserts. Anything past it is rejected rather than truncated, because a
 * silently half-recorded batch is the harder thing to notice.
 */
const RECALL_EVENT_BATCH_MAX = 50;

/**
 * The plural of the route below, for events that arrive together.
 *
 * Home shows six suggestions and recorded six impressions as six requests. They are written
 * one at a time here rather than as a multi-row insert because `recordRecallEvent` is more
 * than an insert for some actions — an `open` also bumps spaced repetition and touches the
 * study-bible layer — and one code path for both routes is worth more than five saved
 * statements on a connection the client is no longer waiting on. The round trips this removes
 * are the ones over the network, which is where they cost.
 *
 * Partial batches are honoured: an entry that fails validation is counted and skipped rather
 * than failing the ones beside it. These are analytics writes the client never reads back, so
 * losing the whole batch to one bad row is the worse trade — but the count comes back in the
 * response so a client that starts sending garbage is not silently accommodated.
 */
route.post('/api/recall/events', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const rows = Array.isArray((body as { events?: unknown })?.events)
      ? ((body as { events: unknown[] }).events)
      : null;
    if (!rows) {
      return c.json({ error: 'Expected an events array', code: 'RECALL_EVENTS_INVALID' }, 400);
    }
    if (rows.length > RECALL_EVENT_BATCH_MAX) {
      return c.json({ error: 'Too many events', code: 'RECALL_EVENTS_TOO_MANY' }, 400);
    }

    let recorded = 0;
    let rejected = 0;
    for (const row of rows) {
      const input = validateRecallEventInput(row);
      if (!input) {
        rejected += 1;
        continue;
      }
      await recordRecallEvent(auth.userId, input);
      recorded += 1;
    }

    return c.json({ success: true, recorded, rejected });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/recall/events', action: 'recall_events' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

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
 * Partitioned by room, matching the client's cooldown store, which has always been keyed by
 * space. Until Sep 2026 this table was user-scoped only, so the local half of suppression was
 * space-correct and the cross-device half was not — dismissing a suggestion on a laptop would
 * have hidden it in every room on a phone. Harmless while recall ran in one space, and the
 * blocker for running it anywhere else.
 *
 * `spaceId` absent means the reader's personal Home, and the personal space reads NULL rows
 * too: every row written before the column existed came from there. So no backfill, and a
 * legacy dismissal keeps working exactly where it was made.
 */
route.get('/api/recall/events/recent', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    // RecallEvents.createdAt is a timestamp column, so compare against a Date.
    const since = new Date(Date.now() - RECALL_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    /*
     * Which room's suppression to answer with.
     *
     * No `spaceId` means personal Home, and personal Home also owns every legacy NULL row.
     * Asked for a room, the answer is that room alone — a dismissal made in a life group must
     * not follow you home, and one made at home must not silence the group.
     *
     * The requested id is not checked against membership: this partitions one person's own
     * history, grants nothing, and is never read across users, so a bogus value costs the
     * sender their own cooldowns and no one else anything.
     */
    const requestedSpaceId = c.req.query('spaceId')?.trim() || null;
    const roomScope = await resolveRecallRoomScope(auth.userId, requestedSpaceId);

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
            roomScope,
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
            roomScope,
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
