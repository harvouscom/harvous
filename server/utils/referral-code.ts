/**
 * Server-side referral code utilities — Drizzle port of src/utils/referral-code.ts
 */

import { db, first, UserMetadata, eq } from '../db';

const PREFIX_MAX_LEN = 6;
const SUFFIX_LEN = 5;
const FALLBACK_PREFIX = 'USER';

/**
 * Generate a deterministic referral code from firstName and userId.
 */
export function generateReferralCode(firstName: string | null, userId: string): string {
  const prefix = (firstName ?? '')
    .replace(/\W/g, '')
    .toUpperCase()
    .slice(0, PREFIX_MAX_LEN) || FALLBACK_PREFIX;
  const suffix = hashToBase36(userId).slice(0, SUFFIX_LEN);
  return `${prefix}-${suffix}`;
}

function hashToBase36(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h * 31 + c) >>> 0;
  }
  return h.toString(36).toUpperCase();
}

/**
 * Resolve ref to referrer userId.
 */
export async function resolveRefToUserId(ref: string): Promise<string | null> {
  const trimmed = (ref ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('user_')) {
    const row = first(await db
      .select({ userId: UserMetadata.userId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, trimmed))
      .limit(1));
    return row ? trimmed : null;
  }

  const row = first(await db
    .select({ userId: UserMetadata.userId })
    .from(UserMetadata)
    .where(eq(UserMetadata.referralCode, trimmed))
    .limit(1));
  return row?.userId ?? null;
}

/**
 * Resolve ref to referrer display name.
 */
export async function getReferrerDisplayName(ref: string): Promise<string | null> {
  const trimmed = (ref ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('user_')) {
    const row = first(await db
      .select({ firstName: UserMetadata.firstName })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, trimmed))
      .limit(1));
    return row?.firstName ?? null;
  }

  const row = first(await db
    .select({ firstName: UserMetadata.firstName })
    .from(UserMetadata)
    .where(eq(UserMetadata.referralCode, trimmed))
    .limit(1));
  return row?.firstName ?? null;
}
