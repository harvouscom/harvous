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
  '/api/health', // Lightweight warmup endpoint - must be public for cold start optimization
  '/api/test/xp-comprehensive', // Test endpoint for XP system (dev only)
  '/api/webflow/sync-inbox', // Webflow sync endpoint (uses server-side WEBFLOW_INBOX_API_TOKEN for auth)
  '/api/webflow/webhook', // Webflow webhook endpoint (uses server-side WEBFLOW_WEBHOOK_SECRET for auth)
  '/api/webhooks/clerk', // Clerk webhook endpoint (uses server-side CLERK_WEBHOOK_SECRET for auth)
  '/api/seed-marketing', // Seed script endpoint (dev only)
  '/api/migrations/backfill-last-visited', // Migration endpoint (uses MIGRATION_KEY for auth)
  '/api/migrations/sync-clerk-to-audienceful', // Migration endpoint (uses MIGRATION_KEY for auth)
  '/api/migrations/retry-failed-users', // Retry migration endpoint (uses MIGRATION_KEY for auth)
  '/api/stats/user-count' // Public stats endpoint for Webflow integration
])

// Protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/',
  '/find',
  '/profile',
  '/[id]'
])

// Clerk middleware - handles authentication for protected routes
export const onRequest = clerkMiddleware((auth, context) => {
  const { redirectToSignIn, userId } = auth()

  // Allow public routes through
  if (isPublicRoute(context.request)) {
    return
  }

  // Redirect unauthenticated users to sign-in for protected routes
  if (!userId && isProtectedRoute(context.request)) {
    return redirectToSignIn()
  }
});
