/**
 * Test routes — Hono port of src/pages/api/test/*.ts
 *
 * Endpoints:
 *   POST /api/test/reset-to-new-user — Clear all current user data + UserMetadata so
 *        on refresh the app treats them as new and creates only the onboarding thread.
 *        Dev only. No auth required: pass { "userId": "user_xxx" } in body, or omit to use session.
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import { resetUserToNew } from '../utils/reset-user-to-new';

const app = new Hono();

/** POST /api/test/reset-to-new-user — dev only, auth bypassed; optional body: { userId } */
app.post('/api/test/reset-to-new-user', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Test endpoint not available in production' }, 403);
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as { userId?: string };
    const auth = getAuth(c);
    const userId = body.userId ?? auth.userId ?? null;
    if (!userId) {
      return c.json(
        { error: 'Provide userId in request body (e.g. { "userId": "user_xxx" }) or be logged in' },
        400
      );
    }

    await resetUserToNew(userId);
    console.log(`✅ Reset user ${userId} to new-user state (all content cleared)`);

    return c.json({
      success: true,
      message: 'All your data was cleared. Refresh the page to see the onboarding experience (like a new user).'
    });
  } catch (error: any) {
    console.error('Reset to new user error:', error);
    return c.json({ error: error.message || 'Failed to reset user' }, 500);
  }
});

export default app;
