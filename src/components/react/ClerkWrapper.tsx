import { ClerkProvider } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';

interface ClerkWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wraps components in ClerkProvider for static builds
 * Each React Island needs its own provider since Astro doesn't inject global context
 *
 * In static builds (output: "static"), @clerk/astro doesn't provide a global ClerkProvider.
 * React Islands that use Clerk hooks (useAuth, useUser, etc.) must be wrapped with this component.
 *
 * CRITICAL: Must wait for global window.Clerk to be loaded before rendering ClerkProvider,
 * otherwise React will throw error #418 (hooks called outside provider context).
 */
export function ClerkWrapper({ children, fallback }: ClerkWrapperProps) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [clerkLoaded, setClerkLoaded] = useState(false);

  useEffect(() => {
    // Get publishable key from window (set by Layout.astro)
    const key = (window as any).CLERK_PUBLISHABLE_KEY || import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
    setPublishableKey(key);

    // Wait for global Clerk to be loaded before rendering ClerkProvider
    const checkClerkLoaded = () => {
      if ((window as any).Clerk) {
        setClerkLoaded(true);
      } else {
        // Check again in 50ms
        setTimeout(checkClerkLoaded, 50);
      }
    };

    checkClerkLoaded();
  }, []);

  // Don't render until both publishable key AND global Clerk are ready
  if (!publishableKey || !clerkLoaded) {
    return <>{fallback || null}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      {children}
    </ClerkProvider>
  );
}
