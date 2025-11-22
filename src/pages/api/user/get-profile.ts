import type { APIRoute } from 'astro';
import { getCachedUserData } from '@/utils/user-cache';
import { db, UserMetadata, eq } from 'astro:db';

export const GET: APIRoute = async ({ locals }) => {
  console.log('🚀 GET-PROFILE API CALLED - Server-side debug started');
  // Production debugging - only log in production
  if (import.meta.env.PROD) {
    console.log('🌍 Environment Debug:', {
      environment: import.meta.env.MODE,
      hasClerkSecret: !!import.meta.env.CLERK_SECRET_KEY,
      clerkSecretLength: import.meta.env.CLERK_SECRET_KEY?.length
    });
  }
  
  try {
    const { userId } = locals.auth();
    console.log('🔐 GET-PROFILE Auth check - userId:', userId);
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use the same cached user data function that pages use
    // This ensures consistency and proper cache invalidation
    const userData = await getCachedUserData(userId);
    
    console.log('get-profile API - userData:', userData);
    
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
        
        console.log('📊 Church data retrieved from database:', {
          raw: {
            churchName: userMetadata.churchName,
            churchCity: userMetadata.churchCity,
            churchState: userMetadata.churchState
          },
          processed: churchData,
          hasData: !!(churchData.churchName || churchData.churchCity || churchData.churchState)
        });
      } else {
        console.log('⚠️ No UserMetadata record found for userId:', userId);
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
    
    console.log('✅ get-profile API - returning data:', { 
      ...responseData,
      churchDataExists: !!(churchData.churchName || churchData.churchCity || churchData.churchState)
    });

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
