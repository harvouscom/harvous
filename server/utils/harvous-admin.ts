import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { createClerkClient } from '@clerk/backend';
import { getAuth } from '../middleware/auth';

// TTL so admin revocation (email removed from HARVOUS_ADMIN_EMAILS, or email
// changed in Clerk) takes effect without a server restart.
const ADMIN_EMAIL_CACHE_TTL_MS = 60 * 60 * 1000;
const adminEmailByUserId = new Map<string, { email: string | null; expiresAt: number }>();

export function getHarvousSystemUserId(): string {
  const id = process.env.HARVOUS_SYSTEM_USER_ID;
  if (!id) throw new Error('Missing env HARVOUS_SYSTEM_USER_ID');
  return id;
}

export function parseHarvousAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function parseHarvousAdminUserIds(raw: string | undefined, systemUserId?: string): Set<string> {
  const ids = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const set = new Set(ids);
  const systemId = systemUserId?.trim();
  if (systemId) set.add(systemId);
  return set;
}

function isHarvousAdminSecret(c: Context): boolean {
  const expectedSecret = process.env.HARVOUS_ADMIN_SECRET?.trim();
  if (!expectedSecret) return false;
  // Netlify's proxy can duplicate the Authorization header → "Bearer <tok>, Bearer <tok>"
  const authHeader = (c.req.header('authorization') ?? c.req.header('Authorization') ?? '').split(',')[0].trim();
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = m?.[1]?.trim();
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expectedSecret);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

async function clerkPrimaryEmail(userId: string): Promise<string | null> {
  const cached = adminEmailByUserId.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.email;
  }

  const cache = (email: string | null) => {
    adminEmailByUserId.set(userId, { email, expiresAt: Date.now() + ADMIN_EMAIL_CACHE_TTL_MS });
    return email;
  };

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return cache(null);

  try {
    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(userId);
    const primary = user.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId);
    return cache(primary?.emailAddress?.trim().toLowerCase() ?? null);
  } catch {
    return cache(null);
  }
}

export async function isHarvousAdmin(c: Context): Promise<boolean> {
  if (isHarvousAdminSecret(c)) return true;

  const auth = getAuth(c);
  const userId = auth?.userId ?? null;
  if (!userId) return false;

  const systemUserId = process.env.HARVOUS_SYSTEM_USER_ID?.trim();
  const adminUserIds = parseHarvousAdminUserIds(process.env.HARVOUS_ADMIN_USER_IDS, systemUserId);
  if (adminUserIds.has(userId)) return true;

  const adminEmails = parseHarvousAdminEmails(process.env.HARVOUS_ADMIN_EMAILS);
  if (adminEmails.size === 0) return false;

  const email = await clerkPrimaryEmail(userId);
  return email != null && adminEmails.has(email);
}

export async function requireHarvousAdmin(c: Context) {
  if (!(await isHarvousAdmin(c))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return null;
}
