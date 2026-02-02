export const prerender = false;

import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { hashPinNew, validatePinFormat, verifyPin } from '@/utils/lock-pin-server';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/user/set-lock-pin', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimit.error, code: 'RATE_LIMIT_EXCEEDED' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
            'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
          }
        }
      );
    }

    const body = await request.json();
    const { pin, currentPin, newPin } = body;

    // Set: { pin }. Change: { currentPin, newPin }
    const isChange = typeof currentPin === 'string' && typeof newPin === 'string';
    const pinToSet = isChange ? newPin : pin;

    if (!pinToSet || !validatePinFormat(pinToSet)) {
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

    if (!existing) {
      return new Response(
        JSON.stringify({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (isChange) {
      if (!existing.lockPinSalt || !existing.lockPinHash) {
        return new Response(
          JSON.stringify({ error: 'No lock PIN set', code: 'NO_LOCK_PIN' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!validatePinFormat(currentPin)) {
        return new Response(
          JSON.stringify({ error: 'Current PIN must be exactly 4 digits', code: 'INVALID_PIN' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!verifyPin(currentPin, existing.lockPinSalt, existing.lockPinHash)) {
        return new Response(
          JSON.stringify({ error: 'Incorrect current PIN', code: 'INCORRECT_PIN' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const { salt, hash } = hashPinNew(pinToSet);

    await db
      .update(UserMetadata)
      .set({
        lockPinSalt: salt,
        lockPinHash: hash,
        updatedAt: new Date()
      })
      .where(eq(UserMetadata.userId, userId));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/set-lock-pin',
      action: 'set_lock_pin'
    });
    return new Response(
      JSON.stringify({ error: standardError.message, code: standardError.code }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
