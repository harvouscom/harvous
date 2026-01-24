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
 */
export function ClerkWrapper({ children, fallback }: ClerkWrapperProps) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);

  useEffect(() => {
    // Get publishable key from window (set by Layout.astro)
    const key = (window as any).CLERK_PUBLISHABLE_KEY || import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
    setPublishableKey(key);
  }, []);

  if (!publishableKey) {
    return <>{fallback || <div>Loading...</div>}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      {children}
    </ClerkProvider>
  );
}
