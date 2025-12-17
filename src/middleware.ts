import { validateAndThrow } from '@/utils/env-validation'
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server'

// Check if we're in self-hosted mode
const isSelfHosted = import.meta.env.SELF_HOSTED === 'true';

// Validate environment variables on startup (only in production, only in SaaS mode)
if (import.meta.env.PROD && !isSelfHosted) {
  try {
    validateAndThrow();
  } catch (error) {
    // Log error but don't crash - let the application start
    // Individual API endpoints will handle missing env vars
    console.error('Environment validation warning:', error);
  }
}

// Self-hosted mode: no authentication required
if (isSelfHosted) {
  // Simple passthrough middleware for self-hosted mode
  export const onRequest = async (context: any, next: any) => {
    // In self-hosted mode, allow all routes without authentication
    return next();
  };
} else {
  // SaaS mode: use Clerk authentication
  // Define public routes that should never be protected
  const isPublicRoute = createRouteMatcher([
    '/sign-in',
    '/sign-up',
    '/logout',
    '/api/health', // Lightweight warmup endpoint - must be public for cold start optimization
    '/api/test/xp-comprehensive', // Test endpoint for XP system (dev only)
    '/api/webflow/sync-inbox', // Webflow sync endpoint (uses server-side WEBFLOW_API_TOKEN for auth)
    '/api/webflow/webhook' // Webflow webhook endpoint (uses server-side WEBFLOW_WEBHOOK_SECRET for auth)
  ])

  export const onRequest = clerkMiddleware((auth, context, next) => {
    // Skip auth check for public routes
    if (isPublicRoute(context.request)) {
      return next();
    }

    // All other routes are protected - check if user is authenticated
    // This includes: /, /profile, /find, /new-space, and all dynamic routes like /[id].astro
    if (!auth().userId) {
      // Redirect to custom sign-in page instead of Clerk's default page
      const signInUrl = new URL('/sign-in', context.request.url);
      // Preserve the current path as return URL so user can be redirected back after sign-in
      signInUrl.searchParams.set('redirect_url', context.request.url);
      return Response.redirect(signInUrl);
    }

    return next();
  })
}
