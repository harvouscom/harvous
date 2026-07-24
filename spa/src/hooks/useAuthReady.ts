import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';

/**
 * True once Clerk has loaded, the user is signed in, and a session JWT is available.
 *
 * Waiting for `getToken()` avoids enabling API queries in the brief window where
 * `isSignedIn` is true but the `__session` cookie is not yet usable by the API
 * (cold-start 401s on `/api/navigation/data`, `/api/tags/list`, etc. that still
 * succeed on retry and pollute the console).
 */
export function useAuthReady(): boolean {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const [sessionJwtReady, setSessionJwtReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded || !isSignedIn || !userId) {
      setSessionJwtReady(false);
      return;
    }

    void getToken()
      .then((token) => {
        if (!cancelled) setSessionJwtReady(Boolean(token));
      })
      .catch(() => {
        if (!cancelled) setSessionJwtReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, getToken]);

  return Boolean(isLoaded && isSignedIn && userId && sessionJwtReady);
}
