export const prerender = false;

import type { APIRoute } from 'astro';
import { getSubscriptionInfo } from '@/utils/subscription';
import { db, UserMetadata, eq } from 'astro:db';
import { generateReferralCode } from '@/utils/referral-code';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const auth = locals.auth();
    const { userId } = auth;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const subscriptionInfo = await getSubscriptionInfo(userId, auth);
    const metaRow = await db
      .select({
        referralBonusNotes: UserMetadata.referralBonusNotes,
        referralCode: UserMetadata.referralCode,
        firstName: UserMetadata.firstName
      })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    let referralCode = metaRow?.referralCode ?? null;
    const referralBonusNotes = metaRow?.referralBonusNotes ?? 0;

    // Ensure referral code exists (lazy backfill for existing users)
    if (!referralCode) {
      referralCode = generateReferralCode(metaRow?.firstName ?? null, userId);
      await db
        .update(UserMetadata)
        .set({ referralCode, updatedAt: new Date() })
        .where(eq(UserMetadata.userId, userId));
    }

    return new Response(
      JSON.stringify({
        referralBonusNotes,
        referralCode,
        limit: subscriptionInfo.limit
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Referral status error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to load referral status' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
