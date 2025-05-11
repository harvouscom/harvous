// Simple local authentication middleware
import type { defineMiddleware } from 'astro:middleware';

// In a real app you would use a proper auth solution
// This is just a simplified example for local development
export const onRequest = (async (context, next) => {
  // Set up a local user
  context.locals.auth = () => ({
    userId: "local-user-123",
    isLoggedIn: true,
  });
  
  context.locals.currentUser = async () => ({
    id: "local-user-123",
    username: "localuser",
    email: "local@example.com",
  });

  // For demo purposes, we'll handle login path specially
  const url = new URL(context.request.url);
  if (url.pathname === '/login') {
    return context.redirect('/dashboard');
  }
  
  // Continue to the requested page
  return next();
}) satisfies ReturnType<typeof defineMiddleware>;
