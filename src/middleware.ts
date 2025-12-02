import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server'
import { validateAndThrow } from '@/utils/env-validation'

// Validate environment variables on startup (only in production)
if (import.meta.env.PROD) {
  try {
    validateAndThrow();
  } catch (error) {
    // Log error but don't crash - let the application start
    // Individual API endpoints will handle missing env vars
    console.error('Environment validation warning:', error);
  }
}

// Define public routes that should never be protected
const isPublicRoute = createRouteMatcher([
  '/sign-in',
  '/sign-up',
  '/logout',
  '/api/health', // Lightweight warmup endpoint - must be public for cold start optimization
  '/api/test/xp-comprehensive' // Test endpoint for XP system (dev only)
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
