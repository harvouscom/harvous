import type { Context } from 'hono';
import { getAuth } from '../middleware/auth';

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function getHarvousSystemUserId(): string {
  const id = process.env.HARVOUS_SYSTEM_USER_ID;
  if (!id) throw new Error('Missing env HARVOUS_SYSTEM_USER_ID');
  return id;
}

export function isHarvousAdmin(c: Context): boolean {
  const auth = getAuth(c);
  const userId = auth?.userId ?? null;
  const allowlist = splitCsv(process.env.HARVOUS_ADMIN_USER_IDS);
  if (userId && allowlist.includes(userId)) return true;

  const expectedSecret = process.env.HARVOUS_ADMIN_SECRET;
  if (!expectedSecret) return false;
  const authHeader = c.req.header('authorization') ?? '';
  return authHeader === `Bearer ${expectedSecret}`;
}

export function requireHarvousAdmin(c: Context) {
  if (!isHarvousAdmin(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

