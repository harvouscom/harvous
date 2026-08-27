/**
 * POST /api/notes/visit-event — record one note-reading session.
 *
 * There is no matching GET. The aggregate rides on `GET /api/notes/fingerprints`, which
 * already carries every other per-note memory signal Home ranks with — and is already
 * inside Home's readiness gate, so nothing new can arrive late and reshuffle the deck.
 *
 * Distinct from the older `POST /api/notes/:noteId/visit`, which stamps `Notes.lastVisited`
 * on a note row. That one has no client left and is deliberately not being revived: the sync
 * delta pull treats `lastVisited` as a change trigger.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { recordNoteVisit, validateNoteVisitInput } from '../utils/record-note-visit';

const route = new Hono();

route.post('/api/notes/visit-event', requireAuth, rateLimit('note-visit'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const input = validateNoteVisitInput(body);
    if (!input) {
      return c.json({ error: 'Invalid note visit payload', code: 'NOTE_VISIT_INVALID' }, 400);
    }

    // `recorded: false` covers both a note the caller does not own and a database without
    // the table yet. Neither is an error the reader should ever see — the caller is
    // fire-and-forget — so both answer 200 and say so in the body.
    const recorded = await recordNoteVisit(auth.userId, input);
    return c.json({ success: true, recorded });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/visit-event',
      action: 'note_visit_event',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
