/**
 * Dev-only: reset the authenticated user to "new user" state once per server run
 * so dev:all shows only onboarding (no test/seed data) without setting DEV_RESET_USER_ID.
 * Never runs on Netlify (NODE_ENV is not set there, so we also check NETLIFY).
 */

import type { Context, Next } from 'hono';
import { getAuth } from './auth';
import { resetUserToNew } from '../utils/reset-user-to-new';

let devResetDone = false;

export async function devResetUserOnce(c: Context, next: Next) {
  if (process.env.NETLIFY === 'true' || process.env.NODE_ENV === 'production') {
    return next();
  }

  const auth = getAuth(c);
  if (!auth.userId) {
    return next();
  }

  if (devResetDone) {
    return next();
  }

  try {
    await resetUserToNew(auth.userId);
    devResetDone = true;
    console.log(`Dev: reset user to new-user state (onboarding only).`);
  } catch (err) {
    console.error('Dev reset on first request failed:', err);
  }

  return next();
}
