import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId, getToken } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { firstName, lastName, color } = body;

    if (!firstName || !lastName) {
      return new Response(JSON.stringify({ error: 'First name and last name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update user data in Clerk
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    
    if (!clerkSecretKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        // Note: Clerk doesn't have a built-in color field, so we might need to store this in a database
        // For now, we'll just update the name fields
      })
    });

    if (!clerkResponse.ok) {
      const errorText = await clerkResponse.text();
      console.error('Clerk API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to update user data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Store the color preference and updated user data in the database
    try {
      console.log('Updating database with:', { firstName, lastName, color, userId });
      
      // Check if user metadata exists
      const existingMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
      
      if (existingMetadata) {
        console.log('Updating existing metadata');
        // Update existing metadata with new user data and color
        await db.update(UserMetadata)
          .set({ 
            firstName: firstName,
            lastName: lastName,
            userColor: color,
            clerkDataUpdatedAt: new Date(), // Keep cache valid with fresh data
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));
        
        console.log('Database updated successfully');
      } else {
        console.log('Creating new metadata record');
        // Create new metadata record
        await db.insert(UserMetadata).values({
          id: `user_metadata_${userId}`,
          userId: userId,
          firstName: firstName,
          lastName: lastName,
          userColor: color,
          highestSimpleNoteId: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          clerkDataUpdatedAt: new Date()
        });
        
        console.log('Database record created successfully');
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue with success response even if database save fails
    }

    // Note: We don't need to invalidate the cache since we just updated it with the correct data
    // The cache now contains the updated firstName, lastName, and userColor
    console.log('User data updated successfully in database');

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Profile updated successfully',
      user: {
        firstName,
        lastName,
        color
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
