import { useAuth } from '@clerk/clerk-react';

/** True once Clerk has loaded and the user is signed in with a stable user id. */
export function useAuthReady(): boolean {
  const { isLoaded, isSignedIn, userId } = useAuth();
  return isLoaded && isSignedIn && !!userId;
}
