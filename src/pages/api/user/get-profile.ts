import type { APIRoute } from 'astro';
import { getCachedUserData } from '@/utils/user-cache';

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
    
    console.log('get-profile API - userData:', userData);
    
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
    
    console.log('get-profile API - returning:', { 
      firstName: userData.firstName, 
      lastName: userData.lastName, 
      userColor: userData.userColor, 
      email: userData.email, 
      emailVerified 
    });

    return new Response(JSON.stringify({ 
      firstName: userData.firstName,
      lastName: userData.lastName,
      userColor: userData.userColor,
      email: userData.email,
      emailVerified
    }), {
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
