import { clerkClient } from '@clerk/astro/server';

/**
 * Extract userId from Clerk JWT token or session cookie
 * Replaces locals.auth() for static builds with JWT authentication
 */
export async function getAuthFromRequest(request: Request): Promise<string | null> {
  try {
    // Try Authorization header first (JWT token from client)
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const verified = await clerkClient.verifyToken(token);
      return verified.sub; // userId
    }

    // Fallback: session cookie (backward compatibility during migration)
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const sessionId = extractSessionFromCookie(cookieHeader);
      if (sessionId) {
        const session = await clerkClient.sessions.getSession(sessionId);
        return session.userId;
      }
    }

    return null;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

/**
 * Extract Clerk session ID from cookie string
 */
function extractSessionFromCookie(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c =>
    c.startsWith('__session=') || c.startsWith('__clerk')
  );
  if (!sessionCookie) return null;
  return sessionCookie.split('=')[1];
}

/**
 * Standard unauthorized response for API routes
 */
export function unauthorizedResponse(message = 'Unauthorized'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}
