import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

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
        
        // Update existing record - only update church fields, preserve all other fields
        // Astro DB .set() only updates specified fields, but we're being explicit
        await db.update(UserMetadata)
          .set({
            churchName: normalizedChurchName,
            churchCity: normalizedChurchCity,
            churchState: normalizedChurchState,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));
      } else {
        // Create new record (shouldn't happen in normal flow, but handle it)
        // Note: This will only have church fields, other fields will be defaults
        // In practice, UserMetadata should already exist from user creation
        await db.insert(UserMetadata).values({
          id: crypto.randomUUID(),
          userId,
          churchName: normalizedChurchName,
          churchCity: normalizedChurchCity,
          churchState: normalizedChurchState,
          highestSimpleNoteId: 0,
          userColor: 'paper',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Church information updated successfully',
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

