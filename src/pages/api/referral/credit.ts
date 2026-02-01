export const prerender = false;

import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';
import { resolveRefToUserId } from '@/utils/referral-code';

const BONUS_PER_REFERRAL = 100;

export const POST: APIRoute = async ({ cookies, locals }) => {
  try {
    const auth = locals.auth();
    const { userId: currentUserId } = auth;

    if (!currentUserId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const refCookie = cookies.get('harvous_referrer');
    const ref = refCookie?.value?.trim();

    // Clear cookie regardless of outcome so we don't retry indefinitely
    cookies.delete('harvous_referrer', { path: '/' });

    if (!ref) {
      return new Response(JSON.stringify({ credited: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const referrerUserId = await resolveRefToUserId(ref);
    if (!referrerUserId) {
      return new Response(JSON.stringify({ credited: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (referrerUserId === currentUserId) {
      return new Response(JSON.stringify({ credited: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const referrerRow = await db
      .select({ referralBonusNotes: UserMetadata.referralBonusNotes })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, referrerUserId))
      .get();

    if (!referrerRow) {
      return new Response(JSON.stringify({ credited: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const newBonus = (referrerRow.referralBonusNotes ?? 0) + BONUS_PER_REFERRAL;
    await db
      .update(UserMetadata)
      .set({
        referralBonusNotes: newBonus,
        updatedAt: new Date()
      })
      .where(eq(UserMetadata.userId, referrerUserId));

    return new Response(JSON.stringify({ credited: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Referral credit error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to credit referral', credited: false }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
