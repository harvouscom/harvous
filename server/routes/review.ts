/**
 * Review — the reader's own study, handed back to them on a schedule they can predict.
 *
 * Every route here is gated on the `review` feature key. The gate is per-route rather than
 * per-router because `requireFeature` needs an authenticated context, and mounting it at the
 * router level would run it before `requireAuth` on the same request.
 *
 * Nothing in this file calls a model. The prompts are authored (src/utils/review-prompts.ts),
 * the schedule is arithmetic (src/utils/review-scheduling.ts), and what the reader writes is
 * stored and never graded. See docs/future/REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/require-feature';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isReviewTableMissing } from '../utils/pg-undefined-relation';
import {
  REVIEW_INBOX_MAX_ROWS,
  REVIEW_SESSION_CAP,
  isReviewItemKind,
  isReviewItemStatus,
  isReviewOutcome,
} from '@/utils/review-item-kinds';
import { describeNextReturn } from '@/utils/review-scheduling';
import {
  applyReviewOutcome,
  gradeVerseAnswer,
  buildReviewItemViews,
  buildReviewReveal,
  createReviewItem,
  deferReviewItem,
  getReviewItem,
  listDueReviewItems,
  listReviewItems,
  recordReviewEvent,
  setReviewItemStatus,
} from '../utils/review-service';
import { refillReviewQueue } from '../utils/review-opportunities';

const route = new Hono();

/** The longest a free-text attempt may be. Generous for a paragraph, bounded against abuse. */
const MAX_ATTEMPT_LENGTH = 4000;

/**
 * The inbox — at most three rows, and never a count of what is not shown.
 *
 * `hasMore` is a boolean rather than a number on purpose. The strategy doc's named failure
 * mode is an escalating "27 due" badge, and the honest way to avoid it is not to send the
 * number to the client at all: a count that exists in the payload eventually gets rendered.
 */
route.get('/api/review/inbox', requireAuth, rateLimit('read'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const now = new Date();

    // Top up from the reader's own study before listing, capped per rolling day. Lazy on
    // purpose: no cron, no guessed timezone, and nothing accumulates while they are away.
    await refillReviewQueue(auth.userId, now);

    // One extra row, purely to answer `hasMore` without a second count query.
    const due = await listDueReviewItems(auth.userId, REVIEW_INBOX_MAX_ROWS + 1, now);
    const shown = due.slice(0, REVIEW_INBOX_MAX_ROWS);
    const items = await buildReviewItemViews(auth.userId, shown);

    return c.json({ success: true, items, hasMore: due.length > REVIEW_INBOX_MAX_ROWS });
  } catch (error) {
    // A database without the tables yet is an empty inbox, not a broken Activity page.
    if (isReviewTableMissing(error)) {
      return c.json({ success: true, items: [], hasMore: false });
    }
    const standardError = handleAPIError(error, { endpoint: '/api/review/inbox', action: 'review_inbox' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** The manage list: everything, or one status. Used by the Review page, not the inbox. */
route.get('/api/review/items', requireAuth, rateLimit('read'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const statusParam = c.req.query('status');
    if (statusParam && !isReviewItemStatus(statusParam)) {
      return c.json({ error: 'Unknown status', code: 'REVIEW_STATUS_INVALID' }, 400);
    }
    const rows = await listReviewItems(
      auth.userId,
      statusParam && isReviewItemStatus(statusParam) ? statusParam : undefined,
    );
    const items = await buildReviewItemViews(auth.userId, rows);
    return c.json({ success: true, items });
  } catch (error) {
    if (isReviewTableMissing(error)) return c.json({ success: true, items: [] });
    const standardError = handleAPIError(error, { endpoint: '/api/review/items', action: 'review_items' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * One sitting's worth of due items.
 *
 * Capped rather than paginated: a session is a sitting, and "load more" on a review queue is
 * the backlog anxiety the doc rules out wearing a different hat. Whatever is left is still
 * there tomorrow, and tomorrow is when it should be asked about.
 */
route.get('/api/review/session', requireAuth, rateLimit('read'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    await refillReviewQueue(auth.userId);
    const rows = await listDueReviewItems(auth.userId, REVIEW_SESSION_CAP);
    const items = await buildReviewItemViews(auth.userId, rows);
    for (const row of rows) await recordReviewEvent(auth.userId, row, 'shown');
    return c.json({ success: true, items });
  } catch (error) {
    if (isReviewTableMissing(error)) return c.json({ success: true, items: [] });
    const standardError = handleAPIError(error, { endpoint: '/api/review/session', action: 'review_session' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * The reveal — deliberately its own request, made when the reader asks for it.
 *
 * Sending the note body with the prompt would put the answer in the page's memory while the
 * question is still on screen, which is a devtools tab away from being no exercise at all.
 * More to the point, the request itself is the signal: fetching this is what "I need to see
 * it" means, and the outcome recorded afterwards depends on whether it happened first.
 */
route.get('/api/review/items/:id/reveal', requireAuth, rateLimit('read'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const item = await getReviewItem(auth.userId, c.req.param('id') ?? '');
    if (!item) return c.json({ error: 'Review item not found', code: 'REVIEW_ITEM_NOT_FOUND' }, 404);
    const reveal = await buildReviewReveal(auth.userId, item);
    return c.json({ success: true, ...reveal });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/review/items/:id/reveal', action: 'review_reveal' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/review/items', requireAuth, rateLimit('write'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const kind = typeof body?.kind === 'string' ? body.kind : '';
    if (!isReviewItemKind(kind)) {
      return c.json({ error: 'Unknown review kind', code: 'REVIEW_KIND_INVALID' }, 400);
    }

    const result = await createReviewItem(auth.userId, {
      kind,
      noteId: typeof body?.noteId === 'string' ? body.noteId : null,
      secondaryNoteId: typeof body?.secondaryNoteId === 'string' ? body.secondaryNoteId : null,
      studyThreadEntryId:
        typeof body?.studyThreadEntryId === 'string' ? body.studyThreadEntryId : null,
      scriptureReference:
        typeof body?.scriptureReference === 'string' ? body.scriptureReference : null,
      translation: typeof body?.translation === 'string' ? body.translation : null,
    });

    if ('error' in result) {
      return c.json({ error: result.error, code: 'REVIEW_ITEM_INVALID' }, 400);
    }

    const [view] = await buildReviewItemViews(auth.userId, [result.item]);
    return c.json({ success: true, item: view, created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    if (isReviewTableMissing(error)) {
      return c.json({ error: 'Review is not available yet', code: 'REVIEW_UNAVAILABLE' }, 503);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/review/items', action: 'review_item_create' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/review/items/:id/outcome', requireAuth, rateLimit('write'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const item = await getReviewItem(auth.userId, c.req.param('id') ?? '');
    if (!item) return c.json({ error: 'Review item not found', code: 'REVIEW_ITEM_NOT_FOUND' }, 404);

    const body = await c.req.json();
    const outcome = typeof body?.outcome === 'string' ? body.outcome : '';
    if (!isReviewOutcome(outcome)) {
      return c.json({ error: 'Unknown outcome', code: 'REVIEW_OUTCOME_INVALID' }, 400);
    }

    const attempt =
      typeof body?.attempt === 'string' ? body.attempt.slice(0, MAX_ATTEMPT_LENGTH) : null;

    /*
     * Two rungs of the verse ladder have a right answer, and on those the reader's own verdict
     * is not the input — the arrangement or the option they chose is. Marked here rather than
     * in the page, because a puzzle whose answer key reached the client is not a puzzle.
     *
     * Every other rung stays exactly as it was: an open question, judged by the person who
     * wrote the note, with nothing stored to compare it against.
     */
    const answer =
      body?.answer && typeof body.answer === 'object'
        ? {
            order: Array.isArray(body.answer.order)
              ? body.answer.order.filter((v: unknown) => Number.isInteger(v)).slice(0, 12)
              : undefined,
            option: typeof body.answer.option === 'string' ? body.answer.option : undefined,
          }
        : null;
    const graded = answer ? await gradeVerseAnswer(auth.userId, item, answer) : null;

    const { item: updated, nextReturnDays } = await applyReviewOutcome(
      auth.userId,
      item,
      graded ?? outcome,
      attempt,
    );

    return c.json({
      success: true,
      item: (await buildReviewItemViews(auth.userId, [updated]))[0],
      next: {
        intervalDays: nextReturnDays,
        dueAt: updated.dueAt.toISOString(),
        recallState: updated.recallState,
        // The one line the session shows afterwards, phrased once on the server so web and
        // native cannot drift on how a fortnight is described.
        label: describeNextReturn(nextReturnDays),
      },
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/review/items/:id/outcome', action: 'review_outcome' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/review/items/:id/defer', requireAuth, rateLimit('write'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const item = await getReviewItem(auth.userId, c.req.param('id') ?? '');
    if (!item) return c.json({ error: 'Review item not found', code: 'REVIEW_ITEM_NOT_FOUND' }, 404);
    const updated = await deferReviewItem(auth.userId, item);
    return c.json({ success: true, dueAt: updated.dueAt.toISOString() });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/review/items/:id/defer', action: 'review_defer' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/review/items/:id/status', requireAuth, rateLimit('write'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const item = await getReviewItem(auth.userId, c.req.param('id') ?? '');
    if (!item) return c.json({ error: 'Review item not found', code: 'REVIEW_ITEM_NOT_FOUND' }, 404);

    const body = await c.req.json();
    const status = typeof body?.status === 'string' ? body.status : '';
    if (!isReviewItemStatus(status)) {
      return c.json({ error: 'Unknown status', code: 'REVIEW_STATUS_INVALID' }, 400);
    }

    const updated = await setReviewItemStatus(auth.userId, item, status);
    return c.json({
      success: true,
      item: (await buildReviewItemViews(auth.userId, [updated]))[0],
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/review/items/:id/status', action: 'review_status' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
