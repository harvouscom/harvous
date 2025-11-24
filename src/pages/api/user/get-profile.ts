import type { APIRoute } from 'astro';
import { getCachedUserData } from '@/utils/user-cache';
import { db, UserMetadata, eq } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use the same cached user data function that pages use
    // This ensures consistency and proper cache invalidation
    const userData = await getCachedUserData(userId);
    
    // Get church data from UserMetadata table
    let churchData = {
      churchName: null as string | null,
      churchCity: null as string | null,
      churchState: null as string | null
    };
    
    try {
      const userMetadata = await db.select()
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .get();
      
      if (userMetadata) {
        // Preserve actual database values (null or string) - don't convert empty strings to null
        // Empty strings shouldn't exist in DB, but if they do, preserve them
        churchData = {
          churchName: userMetadata.churchName ?? null,
          churchCity: userMetadata.churchCity ?? null,
          churchState: userMetadata.churchState ?? null
        };
      }
    } catch (error) {
      console.error('❌ Error fetching church data from database:', error);
      // Don't fail the request if church data fetch fails
    }
    
    // Get user email verification status from Clerk API
    let emailVerified = false;
    
    try {
      const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
      if (clerkSecretKey) {
        const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (clerkResponse.ok) {
          const clerkUser = await clerkResponse.json();
          emailVerified = clerkUser.email_addresses?.[0]?.verification?.status === 'verified';
        }
      }
    } catch (error) {
      console.error('Error fetching email verification from Clerk:', error);
    }
    
    const responseData = {
      firstName: userData.firstName,
      lastName: userData.lastName,
      userColor: userData.userColor,
      email: userData.email,
      emailVerified,
      churchName: churchData.churchName,
      churchCity: churchData.churchCity,
      churchState: churchData.churchState
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/get-profile',
      action: 'get_user_profile'
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
