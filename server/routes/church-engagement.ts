/**
 * Aggregate engagement — the one church-facing route that counts anything.
 *
 * Its own file for the same reason the teaching plan has one: the contract test
 * that protects it reads source, and a route whose whole point is aggregation
 * must not share a file with routes that are forbidden from aggregating. Here
 * `count(*)` is expected; next door it is a bug.
 *
 * Read-only by construction — there is no write half, now or later. Anything a
 * church could *change* about engagement is a different feature with a different
 * gate.
 *
 * Endpoints:
 *   GET /api/church/engagement?orgId=…
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { handleAPIError } from '@/utils/error-handling';
import {
  assertCanViewChurchEngagement,
  getChurchEngagement,
} from '../utils/church-engagement';

const app = new Hono();

app.get('/api/church/engagement', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();

    const gate = await assertCanViewChurchEngagement(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const engagement = await getChurchEngagement(gate.church);

    return c.json({
      church: { id: gate.church.id, name: gate.church.name },
      ...engagement,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/engagement',
      action: 'church_engagement',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
