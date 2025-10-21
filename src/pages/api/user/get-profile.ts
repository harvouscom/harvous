import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user metadata including color preference and cached user data
    const userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
    
    console.log('get-profile API - userMetadata:', userMetadata);
    
    const userColor = userMetadata?.userColor || 'paper';
    const firstName = userMetadata?.firstName || '';
    const lastName = userMetadata?.lastName || '';
    
    // Get user email from Clerk API
    let email = '';
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
          email = clerkUser.email_addresses?.[0]?.email_address || '';
          emailVerified = clerkUser.email_addresses?.[0]?.verification?.status === 'verified';
        }
      }
    } catch (error) {
      console.error('Error fetching user email from Clerk:', error);
    }
    
    console.log('get-profile API - returning:', { firstName, lastName, userColor, email, emailVerified });

    return new Response(JSON.stringify({ 
      firstName,
      lastName,
      userColor,
      email,
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
