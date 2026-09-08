/**
 * Challenges — a bounded path through study the reader already has.
 *
 * Gated on the `challenges` feature key, per-route for the same reason as Review: the gate
 * reads an authenticated context, so it must run after `requireAuth` on the same request.
 *
 * Steps are built once at creation from an authored template and stored as JSON. Nothing here
 * generates step text at runtime; the personalization is entirely in which of the reader's
 * notes, verses and connections the template is bound to.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/require-feature';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isChallengesTableMissing } from '../utils/pg-undefined-relation';
import {
  isChallengeSettableStatus,
  isChallengeStatus,
  isChallengeTemplateKey,
  type ChallengeStatus,
} from '@/utils/review-item-kinds';
import {
  buildChallengeContext,
  completeChallengeStep,
  createChallenge,
  getChallenge,
  listChallenges,
  setChallengeStatus,
  toChallengeView,
} from '../utils/challenge-service';

const route = new Hono();

/** A step's written answer. Short by design — the long-form work belongs in a note. */
const MAX_RESPONSE_LENGTH = 2000;

route.get('/api/challenges', requireAuth, rateLimit('read'), requireFeature('challenges'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    /*
     * `status` takes a comma-separated list, so a caller wanting two of them makes one request.
     * Home wants exactly that — open challenges for the Review section, open and paused for the
     * Strengthen row — and asked as two requests it was two round trips for one overlapping list.
     *
     * Still all-or-nothing on validation: one unknown name rejects the whole parameter rather
     * than being dropped, because a filter that quietly ignores half of what it was given
     * returns a plausible wrong answer.
     */
    const statusParam = c.req.query('status');
    const statuses = statusParam
      ? statusParam.split(',').map((part) => part.trim()).filter(Boolean)
      : [];
    if (statusParam && (statuses.length === 0 || !statuses.every(isChallengeStatus))) {
      return c.json({ error: 'Unknown status', code: 'CHALLENGE_STATUS_INVALID' }, 400);
    }
    const rows = await listChallenges(
      auth.userId,
      statuses.length > 0 ? (statuses as ChallengeStatus[]) : undefined,
    );
    return c.json({ success: true, challenges: rows.map(toChallengeView) });
  } catch (error) {
    // No table yet is no challenges, not a broken Activity page.
    if (isChallengesTableMissing(error)) return c.json({ success: true, challenges: [] });
    const standardError = handleAPIError(error, { endpoint: '/api/challenges', action: 'challenges_list' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.get('/api/challenges/:id', requireAuth, rateLimit('read'), requireFeature('challenges'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const row = await getChallenge(auth.userId, c.req.param('id') ?? '');
    if (!row) return c.json({ error: 'Challenge not found', code: 'CHALLENGE_NOT_FOUND' }, 404);
    const context = await buildChallengeContext(auth.userId, row);
    return c.json({ success: true, challenge: toChallengeView(row), context });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/challenges/:id', action: 'challenge_get' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/challenges', requireAuth, rateLimit('write'), requireFeature('challenges'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const templateKey = typeof body?.templateKey === 'string' ? body.templateKey : '';
    if (!isChallengeTemplateKey(templateKey)) {
      return c.json({ error: 'Unknown challenge', code: 'CHALLENGE_TEMPLATE_INVALID' }, 400);
    }

    const result = await createChallenge(auth.userId, {
      templateKey,
      noteId: typeof body?.noteId === 'string' ? body.noteId : null,
      secondaryNoteId: typeof body?.secondaryNoteId === 'string' ? body.secondaryNoteId : null,
      repNoteId: typeof body?.repNoteId === 'string' ? body.repNoteId : null,
      scriptureReference:
        typeof body?.scriptureReference === 'string' ? body.scriptureReference : null,
      translation: typeof body?.translation === 'string' ? body.translation : null,
      studyThreadEntryId:
        typeof body?.studyThreadEntryId === 'string' ? body.studyThreadEntryId : null,
    });

    if ('error' in result) {
      // An already-open path answers 409 *with its id*, so the client can open the one that
      // exists rather than showing an error about a challenge the reader cannot see.
      const conflict = result.code === 'CHALLENGE_ALREADY_ACTIVE';
      return c.json(
        {
          error: result.error,
          code: result.code ?? 'CHALLENGE_INVALID',
          ...(result.existingId ? { existingId: result.existingId } : {}),
        },
        conflict ? 409 : 400,
      );
    }

    return c.json({ success: true, challenge: toChallengeView(result.challenge) }, 201);
  } catch (error) {
    if (isChallengesTableMissing(error)) {
      return c.json({ error: 'Challenges are not available yet', code: 'CHALLENGES_UNAVAILABLE' }, 503);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/challenges', action: 'challenge_create' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/challenges/:id/steps/:stepKey', requireAuth, rateLimit('write'), requireFeature('challenges'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const row = await getChallenge(auth.userId, c.req.param('id') ?? '');
    if (!row) return c.json({ error: 'Challenge not found', code: 'CHALLENGE_NOT_FOUND' }, 404);

    const body = await c.req.json();
    // `typeof` rather than truthiness, matching the study-plan complete route: a missing
    // status must be a 400, not a silent default that resolves the step the wrong way.
    const status = typeof body?.status === 'string' ? body.status : '';
    if (status !== 'done' && status !== 'skipped') {
      return c.json({ error: 'A step is done or skipped', code: 'CHALLENGE_STEP_STATUS_INVALID' }, 400);
    }

    const result = await completeChallengeStep(
      auth.userId,
      row,
      c.req.param('stepKey') ?? '',
      status,
      {
        artifactNoteId: typeof body?.artifactNoteId === 'string' ? body.artifactNoteId : undefined,
        response:
          typeof body?.response === 'string'
            ? body.response.slice(0, MAX_RESPONSE_LENGTH)
            : undefined,
      },
    );

    if ('error' in result) {
      return c.json({ error: result.error, code: result.code ?? 'CHALLENGE_STEP_INVALID' }, 400);
    }

    return c.json({ success: true, challenge: toChallengeView(result.challenge) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/challenges/:id/steps/:stepKey',
      action: 'challenge_step',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

route.post('/api/challenges/:id/status', requireAuth, rateLimit('write'), requireFeature('challenges'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const row = await getChallenge(auth.userId, c.req.param('id') ?? '');
    if (!row) return c.json({ error: 'Challenge not found', code: 'CHALLENGE_NOT_FOUND' }, 404);

    const body = await c.req.json();
    const status = typeof body?.status === 'string' ? body.status : '';
    // Only the three the reader may choose. `completed` is earned by resolving every step and
    // `retired` is written by the note cascade — neither is settable over HTTP.
    if (!isChallengeSettableStatus(status)) {
      return c.json({ error: 'Unknown status', code: 'CHALLENGE_STATUS_INVALID' }, 400);
    }

    const updated = await setChallengeStatus(auth.userId, row, status);
    return c.json({ success: true, challenge: toChallengeView(updated) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/challenges/:id/status',
      action: 'challenge_status',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
