import type { Context } from 'hono';
import { getAuth } from '../middleware/auth';

export function getHarvousSystemUserId(): string {
  const id = process.env.HARVOUS_SYSTEM_USER_ID;
  if (!id) throw new Error('Missing env HARVOUS_SYSTEM_USER_ID');
  return id;
}

export function isHarvousAdmin(c: Context): boolean {
  const auth = getAuth(c);
  const userId = auth?.userId ?? null;
  const systemUserId = process.env.HARVOUS_SYSTEM_USER_ID;
  if (userId && systemUserId && userId === systemUserId) return true;

  const expectedSecret = process.env.HARVOUS_ADMIN_SECRET?.trim();
  if (!expectedSecret) return false;
  // Netlify's proxy can duplicate the Authorization header → "Bearer <tok>, Bearer <tok>"
  const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').split(',')[0].trim();
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = m?.[1]?.trim();
  return provided === expectedSecret;
}

export function requireHarvousAdmin(c: Context) {
  if (!isHarvousAdmin(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return null;
}
