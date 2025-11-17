import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';

export const POST: APIRoute = async ({ request, locals }) => {
  console.log('🚀 PROFILE UPDATE API CALLED - Server-side debug started');
  try {
    const { userId, getToken } = locals.auth();
    console.log('🔐 Auth check - userId:', userId);
    
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

    // Production debugging - only log in production
    if (import.meta.env.PROD) {
      console.log('🔑 Clerk API Debug:', {
        userId,
        hasSecretKey: !!clerkSecretKey,
        secretKeyLength: clerkSecretKey?.length,
        environment: import.meta.env.MODE
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
        public_metadata: {
          userColor: color  // Store custom field in Clerk's metadata
        }
      })
    });

    if (!clerkResponse.ok) {
      const errorText = await clerkResponse.text();
      console.error('❌ Clerk API error:', {
        status: clerkResponse.status,
        statusText: clerkResponse.statusText,
        error: errorText,
        environment: import.meta.env.MODE,
        isProduction: import.meta.env.PROD
      });
      return new Response(JSON.stringify({ 
        error: 'Failed to update profile in Clerk',
        details: `Status: ${clerkResponse.status}, Environment: ${import.meta.env.MODE}`
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const clerkResponseData = await clerkResponse.json();
    
    // Production debugging - only log in production
    if (import.meta.env.PROD) {
      console.log('✅ Clerk updated successfully:', {
        first_name: clerkResponseData?.first_name,
        last_name: clerkResponseData?.last_name,
        public_metadata: clerkResponseData?.public_metadata,
        userColor_saved: clerkResponseData?.public_metadata?.userColor
      });
    }

    // Force cache refresh by invalidating it completely
    try {
      console.log('🔄 Forcing cache refresh after profile update');
      
      // Import the cache invalidation function
      const { invalidateUserCache } = await import('@/utils/user-cache');
      
      // Invalidate the cache to force fresh fetch from Clerk
      await invalidateUserCache(userId);
      
      console.log('✅ Cache invalidated - next page load will fetch fresh from Clerk');
    } catch (dbError) {
      console.error('❌ Error invalidating cache:', dbError);
      // Don't fail the request - Clerk update succeeded
    }
    
    // Production fallback: Ensure database is updated even if cache invalidation fails
    // Preserve church fields - they should never be lost
    try {
      console.log('🔄 Production fallback: Direct database update');
      
      // Get existing metadata to preserve church fields
      const existingMetadata = await db.select()
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .get();
      
      await db.update(UserMetadata)
        .set({
          firstName,
          lastName,
          userColor: color,
          // Preserve church fields - they are stored in database and should never be lost
          churchName: existingMetadata?.churchName ?? null,
          churchCity: existingMetadata?.churchCity ?? null,
          churchState: existingMetadata?.churchState ?? null,
          updatedAt: new Date()
        })
        .where(eq(UserMetadata.userId, userId));
      console.log('✅ Production fallback: Database updated directly');
    } catch (fallbackError) {
      console.error('❌ Production fallback failed:', fallbackError);
    }

    // Profile updated successfully in Clerk and database
    console.log('✅ User data updated successfully in Clerk and database');
    
    // Production debugging - only log in production
    if (import.meta.env.PROD) {
      console.log('🌍 Production Debug Info:', {
        environment: import.meta.env.MODE,
        hasClerkSecret: !!clerkSecretKey,
        timestamp: new Date().toISOString()
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Profile updated successfully',
      user: {
        firstName,
        lastName,
        color,
        initials: `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase(),
        displayName: `${firstName} ${lastName.charAt(0)}`.trim()
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
