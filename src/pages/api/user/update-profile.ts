import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { validateName, validateColor } from '@/utils/validation';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId, getToken } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/user/update-profile', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
      });
    }

    const body = await request.json();
    const { firstName, lastName, color } = body;

    // Validate first name
    const firstNameValidation = validateName(firstName, 'First name', true);
    if (!firstNameValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: firstNameValidation.error,
        code: firstNameValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate last name
    const lastNameValidation = validateName(lastName, 'Last name', true);
    if (!lastNameValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: lastNameValidation.error,
        code: lastNameValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate color
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: colorValidation.error,
        code: colorValidation.code
      }), {
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

    // Force cache refresh by invalidating it completely
    try {
      // Import the cache invalidation function
      const { invalidateUserCache } = await import('@/utils/user-cache');
      
      // Invalidate the cache to force fresh fetch from Clerk
      await invalidateUserCache(userId);
    } catch (dbError) {
      console.error('❌ Error invalidating cache:', dbError);
      // Don't fail the request - Clerk update succeeded
    }
    
    // Production fallback: Ensure database is updated even if cache invalidation fails
    // Preserve church fields - they should never be lost
    try {
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
    } catch (fallbackError) {
      console.error('❌ Production fallback failed:', fallbackError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Profile updated',
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
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/update-profile',
      action: 'update_profile'
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
