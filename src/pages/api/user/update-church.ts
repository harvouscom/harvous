import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { awardChurchAddedXP } from '@/utils/xp-system';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/user/update-church', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
      });
    }

    const body = await request.json();
    const { churchName, churchCity, churchState } = body;

    // Normalize input: trim strings and convert empty strings to null
    const normalizedChurchName = typeof churchName === 'string' ? (churchName.trim() || null) : (churchName ?? null);
    const normalizedChurchCity = typeof churchCity === 'string' ? (churchCity.trim() || null) : (churchCity ?? null);
    const normalizedChurchState = typeof churchState === 'string' ? (churchState.trim() || null) : (churchState ?? null);

    // All fields are optional, but we should update the database
    try {
      // Get existing record to preserve other fields
      const existingRecord = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1);
      
      if (existingRecord.length > 0) {
        const existing = existingRecord[0];
        
        // Check if this is the first time adding church info
        const isFirstTimeAddingChurch = !existing.churchName && !existing.churchCity && !existing.churchState && 
                                         (normalizedChurchName || normalizedChurchCity || normalizedChurchState);
        
        // Update existing record - only update church fields, preserve all other fields
        // Astro DB .set() only updates specified fields, but we're being explicit
        await db.update(UserMetadata)
          .set({
            churchName: normalizedChurchName,
            churchCity: normalizedChurchCity,
            churchState: normalizedChurchState,
            churchAddedAt: isFirstTimeAddingChurch ? new Date() : existing.churchAddedAt,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));
        
        // Award XP if this is the first time adding church info
        if (isFirstTimeAddingChurch) {
          await awardChurchAddedXP(userId);
        }
      } else {
        // Create new record (shouldn't happen in normal flow, but handle it)
        // Note: This will only have church fields, other fields will be defaults
        // In practice, UserMetadata should already exist from user creation
        const hasChurchData = normalizedChurchName || normalizedChurchCity || normalizedChurchState;
        await db.insert(UserMetadata).values({
          id: crypto.randomUUID(),
          userId,
          churchName: normalizedChurchName,
          churchCity: normalizedChurchCity,
          churchState: normalizedChurchState,
          churchAddedAt: hasChurchData ? new Date() : null,
          highestSimpleNoteId: 0,
          userColor: 'paper',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Award XP for first-time church addition
        if (hasChurchData) {
          await awardChurchAddedXP(userId);
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Church information updated',
        church: {
          churchName: normalizedChurchName,
          churchCity: normalizedChurchCity,
          churchState: normalizedChurchState
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (dbError) {
      const standardError = handleAPIError(dbError, {
        endpoint: '/api/user/update-church',
        action: 'update_church_info'
      });
      return new Response(JSON.stringify({ 
        error: standardError.message,
        code: standardError.code
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/update-church',
      action: 'update_church_info'
    });
    return new Response(JSON.stringify({ 
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

