import { useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client-side auth guard for static/Capacitor builds
 * Redirects to /sign-in if not authenticated
 *
 * Only used in Capacitor builds (BUILD_TARGET=capacitor)
 * In SSR mode, authentication is handled by middleware
 *
 * Usage in protected pages:
 * ```tsx
 * {isCapacitorBuild ? (
 *   <AuthGuard client:load>
 *     <PageContent client:load />
 *   </AuthGuard>
 * ) : (
 *   <PageContent client:load />
 * )}
 * ```
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // In static builds, use client-side navigation to sign-in
      window.location.href = '/sign-in';
    }
  }, [isLoaded, isSignedIn]);

  // Show fallback while Clerk is loading
  if (!isLoaded) {
    return <>{fallback || null}</>;
  }

  // Show fallback if not signed in (before redirect happens)
  if (!isSignedIn) {
    return <>{fallback || null}</>;
  }

  // User is authenticated, render children
  return <>{children}</>;
}
