import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('🚀 CHURCH UPDATE API CALLED - Server-side debug started');
  try {
    const { userId } = locals.auth();
    console.log('🔐 Auth check - userId:', userId);
    
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

    console.log('📥 Church update data received:', { 
      raw: { churchName, churchCity, churchState },
      normalized: { churchName: normalizedChurchName, churchCity: normalizedChurchCity, churchState: normalizedChurchState }
    });

    // All fields are optional, but we should update the database
    try {
      // Get existing record to preserve other fields and for logging
      const existingRecord = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1);
      
      if (existingRecord.length > 0) {
        const existing = existingRecord[0];
        console.log('📊 Existing church data before update:', {
          churchName: existing.churchName,
          churchCity: existing.churchCity,
          churchState: existing.churchState
        });
        
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
        
        console.log('✅ Church data updated in existing UserMetadata record', {
          before: {
            churchName: existing.churchName,
            churchCity: existing.churchCity,
            churchState: existing.churchState
          },
          after: {
            churchName: normalizedChurchName,
            churchCity: normalizedChurchCity,
            churchState: normalizedChurchState
          }
        });
      } else {
        // Create new record (shouldn't happen in normal flow, but handle it)
        // Note: This will only have church fields, other fields will be defaults
        // In practice, UserMetadata should already exist from user creation
        console.log('⚠️ Creating new UserMetadata record (unexpected - should already exist)');
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
        console.log('✅ Church data inserted in new UserMetadata record');
      }

      // Verify the update by reading back from database
      const verifyRecord = await db.select()
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .get();
      
      console.log('✅ Church data updated successfully in database', {
        verified: {
          churchName: verifyRecord?.churchName,
          churchCity: verifyRecord?.churchCity,
          churchState: verifyRecord?.churchState
        }
      });
      
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
      console.error('❌ Database error:', dbError);
      return new Response(JSON.stringify({ 
        error: 'Failed to update church information in database',
        details: dbError instanceof Error ? dbError.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('❌ Error updating church information:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

