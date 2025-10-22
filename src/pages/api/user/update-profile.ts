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

    // Force cache invalidation to ensure next page load fetches fresh data from Clerk
    // This ensures that when the user navigates away and comes back, fresh data is fetched
    try {
      const staleDate = new Date('2020-01-01'); // Set to very old date to force cache invalidation
      console.log('Cache invalidation - setting clerkDataUpdatedAt to stale date:', staleDate);
      
      await db.update(UserMetadata)
        .set({ 
          clerkDataUpdatedAt: staleDate // Set to very old date to force cache invalidation
        })
        .where(eq(UserMetadata.userId, userId));
      
      console.log('Cache invalidated to force fresh Clerk fetch on next page load');
    } catch (invalidationError) {
      console.error('Error invalidating cache:', invalidationError);
      // Don't fail the request - main update succeeded
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
