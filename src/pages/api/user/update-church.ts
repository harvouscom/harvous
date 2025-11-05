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

    console.log('📥 Church update data:', { churchName, churchCity, churchState });

    // All fields are optional, but we should update the database
    try {
      // Check if UserMetadata record exists
      const existingRecord = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1);
      
      if (existingRecord.length > 0) {
        // Update existing record
        await db.update(UserMetadata)
          .set({
            churchName: churchName || null,
            churchCity: churchCity || null,
            churchState: churchState || null,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));
        console.log('✅ Church data updated in existing UserMetadata record');
      } else {
        // Create new record (shouldn't happen in normal flow, but handle it)
        await db.insert(UserMetadata).values({
          id: crypto.randomUUID(),
          userId,
          churchName: churchName || null,
          churchCity: churchCity || null,
          churchState: churchState || null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log('✅ Church data inserted in new UserMetadata record');
      }

      console.log('✅ Church data updated successfully in database');
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Church information updated successfully',
        church: {
          churchName: churchName || null,
          churchCity: churchCity || null,
          churchState: churchState || null
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

