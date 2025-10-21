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

    // Update user data in Clerk (source of truth)
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    
    if (!clerkSecretKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update Clerk with name AND custom metadata
    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        public_metadata: {
          userColor: color  // Store custom field in Clerk's metadata
        }
      })
    });

    if (!clerkResponse.ok) {
      const errorText = await clerkResponse.text();
      console.error('Clerk API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to update profile in Clerk' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Clerk updated successfully');

    // Update database cache immediately after successful Clerk update
    try {
      await db.update(UserMetadata)
        .set({
          firstName,
          lastName,
          userColor: color,
          clerkDataUpdatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(UserMetadata.userId, userId));
      
      console.log('Database cache updated successfully');
    } catch (dbError) {
      console.error('Error updating database cache:', dbError);
      // Don't fail the request - Clerk update succeeded
    }

    // Profile updated successfully in Clerk and database
    console.log('User data updated successfully in Clerk and database');

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
