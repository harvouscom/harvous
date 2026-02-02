/**
 * Referral code generation and resolution.
 * Codes are PREFIX-SUFFIX: prefix from firstName (4–6 chars), suffix deterministic from userId.
 */

import { db, UserMetadata, eq } from 'astro:db';

const PREFIX_MAX_LEN = 6;
const SUFFIX_LEN = 5;
const FALLBACK_PREFIX = 'USER';

/**
 * Generate a deterministic referral code from firstName and userId.
 * Format: PREFIX-SUFFIX (e.g. JOHN-X7K2). URL-safe: alphanumeric + hyphen.
 */
export function generateReferralCode(firstName: string | null, userId: string): string {
  const prefix = (firstName ?? '')
    .replace(/\W/g, '')
    .toUpperCase()
    .slice(0, PREFIX_MAX_LEN) || FALLBACK_PREFIX;
  const suffix = hashToBase36(userId).slice(0, SUFFIX_LEN);
  return `${prefix}-${suffix}`;
}

/**
 * Simple deterministic hash of userId for suffix. Returns base36 string.
 */
function hashToBase36(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h * 31 + c) >>> 0;
  }
  return h.toString(36).toUpperCase();
}

/**
 * Resolve ref (query param / cookie value) to referrer userId.
 * ref can be a referral code (e.g. JOHN-X7K2) or a Clerk userId (user_...) for backward compatibility.
 */
export async function resolveRefToUserId(ref: string): Promise<string | null> {
  const trimmed = (ref ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('user_')) {
    const row = await db
      .select({ userId: UserMetadata.userId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, trimmed))
      .get();
    return row ? trimmed : null;
  }

  const row = await db
    .select({ userId: UserMetadata.userId })
    .from(UserMetadata)
    .where(eq(UserMetadata.referralCode, trimmed))
    .get();
  return row?.userId ?? null;
}

/**
 * Resolve ref (query param / cookie value) to referrer display name (firstName).
 * Used on the sign-up page to show "{firstName} invited you to Harvous."
 */
export async function getReferrerDisplayName(ref: string): Promise<string | null> {
  const trimmed = (ref ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('user_')) {
    const row = await db
      .select({ firstName: UserMetadata.firstName })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, trimmed))
      .get();
    return row?.firstName ?? null;
  }

  const row = await db
    .select({ firstName: UserMetadata.firstName })
    .from(UserMetadata)
    .where(eq(UserMetadata.referralCode, trimmed))
    .get();
  return row?.firstName ?? null;
}
