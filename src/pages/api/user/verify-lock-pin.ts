export const prerender = false;

import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { validatePinFormat, verifyPin } from '@/utils/lock-pin-server';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { pin } = body;

    if (!pin || !validatePinFormat(pin)) {
      return new Response(
        JSON.stringify({ error: 'PIN must be exactly 4 digits', code: 'INVALID_PIN' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const existing = await db
      .select({
        lockPinSalt: UserMetadata.lockPinSalt,
        lockPinHash: UserMetadata.lockPinHash
      })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    if (!existing?.lockPinSalt || !existing?.lockPinHash) {
      return new Response(
        JSON.stringify({ error: 'No lock PIN set', code: 'NO_LOCK_PIN' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const valid = verifyPin(pin, existing.lockPinSalt, existing.lockPinHash);

    if (!valid) {
      return new Response(
        JSON.stringify({ error: 'Incorrect PIN', code: 'INCORRECT_PIN' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, valid: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/verify-lock-pin',
      action: 'verify_lock_pin'
    });
    return new Response(
      JSON.stringify({ error: standardError.message, code: standardError.code }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
