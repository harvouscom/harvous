// Clerk authentication middleware
import type { defineMiddleware } from 'astro:middleware';
import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server'

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/feed(.*)'])

export const onRequest = clerkMiddleware((auth, context) => {
  const { redirectToSignIn, userId } = auth()

  // Check if URL contains sign-in parameter to force sign-in
  const url = new URL(context.request.url);
  const forceSignIn = url.searchParams.get('sign-in') === 'true';
  
  if (forceSignIn && !userId) {
    // For direct sign-in links, redirect to Clerk's sign-in page
    return redirectToSignIn({
      returnBackUrl: `${url.origin}/feed`
    });
  }

  // Handle protected routes for unauthenticated users
  if (!userId && isProtectedRoute(context.request)) {
    return redirectToSignIn({
      returnBackUrl: context.request.url
    });
  }
}) satisfies ReturnType<typeof defineMiddleware>;
