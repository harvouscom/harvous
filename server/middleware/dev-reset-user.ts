/**
 * Dev-only: reset the authenticated user to "new user" state once per server run
 * so dev:all shows an empty account (no test/seed data). Opt-in via DEV_RESET_ENABLED
 * so production and Netlify never run it (we never set that env there).
 */

import type { Context, Next } from 'hono';
import { getAuth } from './auth';
import { resetUserToNew } from '../utils/reset-user-to-new';

let devResetDone = false;

const DEV_RESET_ENABLED =
  process.env.DEV_RESET_ENABLED === '1' || process.env.DEV_RESET_ENABLED === 'true';

export async function devResetUserOnce(c: Context, next: Next) {
  if (!DEV_RESET_ENABLED) {
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
    console.log(`Dev: reset user to new-user state (empty account).`);
  } catch (err) {
    console.error('Dev reset on first request failed:', err);
  }

  return next();
}
