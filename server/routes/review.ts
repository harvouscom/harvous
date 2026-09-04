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

import { interleaveSession } from '@/utils/review-session-order';
import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/require-feature';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isReviewTableMissing } from '../utils/pg-undefined-relation';
import {
  REVIEW_INBOX_MAX_ROWS,
  REVIEW_INBOX_UNASKABLE_SLACK,
  REVIEW_SESSION_CAP,
  isReviewItemKind,
  isReviewItemStatus,
  isReviewOutcome,
  REVIEW_MAX_ATTEMPTS,
  type ReviewOutcome,
} from '@/utils/review-item-kinds';
import { describeNextReturn } from '@/utils/review-scheduling';
import {
  applyReviewOutcome,
  gradeNoteAnswer,
  gradeVerseAnswer,
  verseTruthFor,
  buildReviewItemViews,
  buildReviewReveal,
  createReviewItem,
  deferReviewItem,
  getReviewItem,
  listDueReviewItems,
  listReviewItems,
  recordReviewEvent,
  setReviewItemStatus,
  stepBackReviewItem,
  buildReviewSample,
  gradeReviewSample,
} from '../utils/review-service';
import { refillReviewQueue } from '../utils/review-opportunities';

const route = new Hono();

/** The longest a free-text attempt may be. Generous for a paragraph, bounded against abuse. */
/** No verse this app shows runs past a couple of hundred words. */
const MAX_WORD_INDEX = 400;
/** `MAX_BLANK_SHARE` caps a cloze well below this; the bound is for what arrives, not what we build. */
const MAX_CLOZE_BLANKS = 24;
const MAX_CLOZE_WORD_LENGTH = 40;
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

    /*
     * Fetch, then drop, then cut — in that order.
     *
     * A note item the resolver can ask nothing about is dropped while views are built, so cutting
     * to three rows first means a dropped item costs a slot. It showed one question with three
     * due, because two rows ahead of it were legacy notes with nothing to ask. The slack is the
     * same trick `review-opportunities.ts` uses when the floor turns a candidate away.
     *
     * One extra row beyond the cut, purely to answer `hasMore` without a second count query.
     */
    const due = await listDueReviewItems(
      auth.userId,
      REVIEW_INBOX_MAX_ROWS + 1 + REVIEW_INBOX_UNASKABLE_SLACK,
      now,
    );
    const askable = await buildReviewItemViews(auth.userId, due, { dropUnaskable: true });
    const items = askable.slice(0, REVIEW_INBOX_MAX_ROWS);

    return c.json({ success: true, items, hasMore: askable.length > REVIEW_INBOX_MAX_ROWS });
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
    const items = await buildReviewItemViews(auth.userId, rows, { dropUnaskable: true });
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
    const rows = interleaveSession(
      (await listDueReviewItems(auth.userId, REVIEW_SESSION_CAP)).map((row) => ({
        ...row,
        groupKey: row.scriptureReference?.trim().toLowerCase() || row.noteId || null,
      })),
    );
    const items = await buildReviewItemViews(auth.userId, rows, { dropUnaskable: true });
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

    /** Which go this is, 1-based. Bounded so a page cannot ask for unlimited tries. */
    const attemptNumber = Number.isInteger(body?.attemptNumber)
      ? Math.max(1, Math.min(REVIEW_MAX_ATTEMPTS, body.attemptNumber))
      : 1;

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
            // Which word the reader pointed at. Sanitised to an integer here rather than
            // trusted: it indexes a token array on the server.
            wordIndex: Number.isInteger(body.answer.wordIndex)
              ? Math.max(0, Math.min(MAX_WORD_INDEX, body.answer.wordIndex))
              : undefined,
            // The words filled into a cloze's gaps. Bounded on both axes: a verse never has
            // more blanks than this, and no single missing word is this long.
            // What the reader wrote back from the first letters. Bounded; graded, never stored
            // as the answer — `attempt` is the stored copy, and that is bounded separately.
            text: typeof body.answer.text === 'string' ? body.answer.text.slice(0, MAX_ATTEMPT_LENGTH) : undefined,
            words: Array.isArray(body.answer.words)
              ? body.answer.words
                  .filter((w: unknown) => typeof w === 'string')
                  .slice(0, MAX_CLOZE_BLANKS)
                  .map((w: string) => w.slice(0, MAX_CLOZE_WORD_LENGTH))
              : undefined,
            // Which question the client believes it was shown. Only ever used to detect that
            // the material moved underneath it, never to decide the answer.
            promptKey: typeof body.answer.promptKey === 'string' ? body.answer.promptKey : undefined,
          }
        : null;
    const graded = answer
      ? item.kind === 'note'
        ? await gradeNoteAnswer(auth.userId, item, answer)
        : await gradeVerseAnswer(auth.userId, item, answer)
      : null;

    /*
     * A wrong first answer is not a verdict yet.
     *
     * Getting one wrong and being told "back in 4 days" teaches nothing — the whole point of
     * spaced repetition is that trying again *now*, and then seeing the right answer, is where
     * the learning happens. So a graded rung gets two goes, and how many it took is what decides
     * the interval:
     *
     *   right first time   → recalled  (a fortnight)
     *   right on the second → almost   (a few days)
     *   wrong twice         → revealed (tomorrow), with the answer shown
     *
     * Nothing is written on a non-final attempt: no outcome, no schedule, no event. The reader
     * is looking at the same question they were looking at a second ago.
     *
     * `attempt` comes from the page, which is the only thing that knows how many goes this has
     * had. A page that always claimed its first attempt would be giving itself a longer interval,
     * which is a way of asking to be shown a verse less often — not an exploit worth a round trip
     * to defend against.
     */
    if (graded && !graded.correct && attemptNumber < REVIEW_MAX_ATTEMPTS) {
      return c.json({
        success: true,
        correct: false,
        finalized: false,
        attemptsLeft: REVIEW_MAX_ATTEMPTS - attemptNumber,
        // What was right, so the next go can be about what was not. The parts index the
        // reader's own submission; nothing here names anything they did not write.
        ...(graded.parts ? { parts: graded.parts } : {}),
        ...(graded.reached ? { reached: graded.reached } : {}),
      });
    }

    const verdict: ReviewOutcome | null = graded
      ? graded.correct
        ? attemptNumber > 1
          ? 'almost'
          : 'recalled'
        : 'revealed'
      : null;

    // The rung that was asked, resolved the way the list resolved it — not the client's claim.
    const asked = (await buildReviewItemViews(auth.userId, [item]))[0]?.promptKey ?? null;
    const { item: updated, nextReturnDays, leech } = await applyReviewOutcome(
      auth.userId,
      item,
      verdict ?? outcome,
      attempt,
      new Date(),
      asked,
    );

    /*
     * The verse a rung withheld, handed back now that the question is answered. Read from the
     * item as it was asked, not as it now is — the outcome has already moved it to the next
     * rung, and the verse owed is the one just answered about.
     */
    const truth = await verseTruthFor(item, auth.userId);

    return c.json({
      success: true,
      /*
       * What was actually recorded, which on a graded rung is not what the page sent.
       *
       * The page has no answer key, so it sends `almost` and lets the server mark the tap. It
       * then told the reader "Almost." whichever way the marking went — a right answer on every
       * graded rung read as a near miss.
       */
      outcome: verdict ?? outcome,
      correct: graded ? graded.correct : undefined,
      finalized: true,
      // Shown only once the question is over, and only where the answer was one of the options:
      // the rungs built out of the verse hand back the verse itself instead.
      ...(graded && !graded.correct && graded.correctAnswer
        ? { correctAnswer: graded.correctAnswer }
        : {}),
      ...(graded?.parts ? { parts: graded.parts } : {}),
      ...(graded?.reached ? { reached: graded.reached } : {}),
      item: (await buildReviewItemViews(auth.userId, [updated]))[0],
      ...(truth ? { truth: { verseText: truth } } : {}),
      ...(leech ? { leech: true } : {}),
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

/**
 * The one offer Review makes when its own asking has stopped working: a leech steps back a rung.
 * Refused on anything that is not slipping — this is not a way to pick the rung.
 */
route.post('/api/review/items/:id/step-back', requireAuth, rateLimit('write'), requireFeature('review'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const item = await getReviewItem(auth.userId, c.req.param('id') ?? '');
    if (!item) return c.json({ error: 'Review item not found', code: 'REVIEW_ITEM_NOT_FOUND' }, 404);
    const updated = await stepBackReviewItem(auth.userId, item);
    if (!updated) return c.json({ error: 'This item is not slipping', code: 'REVIEW_NOT_SLIPPING' }, 400);
    return c.json({
      success: true,
      item: (await buildReviewItemViews(auth.userId, [updated]))[0],
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/review/items/:id/step-back', action: 'review_step_back' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * The sample, for an account without Review. Authenticated, rate-limited, and deliberately
 * not behind `requireFeature`: the point is to show the thing to someone who has not paid for
 * it. It reads and marks; it never writes — no item, no event, no schedule.
 *
 * `day` is the reader's local day, sent by the page: the seed is per reader per day, and the
 * server cannot know which day it is where they are.
 */
route.get('/api/review/sample', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const day = sampleDayFrom(c.req.query('day'));
    const sample = await buildReviewSample(auth.userId, day);
    return c.json({ success: true, sample });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/review/sample', action: 'review_sample' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/review/sample/answer', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const day = sampleDayFrom(typeof body?.day === 'string' ? body.day : undefined);
    const attemptNumber = Number.isInteger(body?.attemptNumber)
      ? Math.max(1, Math.min(REVIEW_MAX_ATTEMPTS, body.attemptNumber))
      : 1;
    const words = Array.isArray(body?.words)
      ? body.words
          .filter((w: unknown) => typeof w === 'string')
          .slice(0, MAX_CLOZE_BLANKS)
          .map((w: string) => w.slice(0, MAX_CLOZE_WORD_LENGTH))
      : [];
    const graded = await gradeReviewSample(auth.userId, day, words);
    if (!graded) return c.json({ error: 'No sample today', code: 'REVIEW_SAMPLE_UNAVAILABLE' }, 404);
    // Same two-attempt rule as the real thing: a miss with a go left keeps the question up
    // and shows nothing; only the final answer brings the verse out.
    if (!graded.correct && attemptNumber < REVIEW_MAX_ATTEMPTS) {
      return c.json({ success: true, correct: false, finalized: false, attemptsLeft: REVIEW_MAX_ATTEMPTS - attemptNumber });
    }
    return c.json({
      success: true,
      correct: graded.correct,
      finalized: true,
      reference: graded.reference,
      verseText: graded.verseText,
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/review/sample/answer', action: 'review_sample_answer' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** `YYYY-MM-DD` from the page, or today in UTC when it is missing or malformed. */
function sampleDayFrom(raw: string | undefined): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

export default route;
