/**
 * Who is using the app right now — the one question surfaces should ask.
 *
 * Before guest mode there were two answers and both came straight from Clerk, so every surface
 * read `useAuth()` and decided for itself. There are three answers now, and the third one is not
 * Clerk's to give: a guest is precisely someone Clerk has never heard of. Deriving that at each
 * call site would mean every surface re-deciding the precedence rule in
 * `resolvePrototypeShellMode`, and the first one to get it wrong would show a signed-in member
 * the "saved on this device" row over their synced notes.
 */
import { useAuth } from '@clerk/clerk-react';
import { useSyncExternalStore } from 'react';
import {
  resolvePrototypeShellMode,
  type PrototypeShellMode,
} from '@/utils/prototype-shell-auth';
import { hasClerkSessionCookieHint } from './queries/useProfile';
import { GUEST_USER_ID, hasGuestSession, subscribeToGuestSession } from '../lib/guest-session';

export interface HarvousIdentity {
  mode: PrototypeShellMode;
  /**
   * The partition writes belong to: a Clerk id, the guest constant, or undefined when there is
   * nobody yet. Never pass this to an authenticated request — see `isAccount`.
   */
  userId: string | undefined;
  /** Reads and writes may talk to the server. */
  isAccount: boolean;
  /** Reads are public-or-local, writes are local, and nothing is pushed. */
  isGuest: boolean;
}

function guestSnapshot(): boolean {
  return hasGuestSession();
}

/** Server render has no storage; a guest marker is by definition a thing this browser holds. */
function guestServerSnapshot(): boolean {
  return false;
}

export function useHarvousIdentity(): HarvousIdentity {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const guest = useSyncExternalStore(subscribeToGuestSession, guestSnapshot, guestServerSnapshot);
  const mode = resolvePrototypeShellMode(
    isLoaded,
    isSignedIn,
    hasClerkSessionCookieHint(),
    guest,
  );

  return {
    mode,
    // `account` can be true a moment before Clerk hands over an id (the cookie-hint window), and
    // that is the one case where the answer is "a member, id pending" rather than "nobody".
    userId: mode === 'guest' ? GUEST_USER_ID : (userId ?? undefined),
    isAccount: mode === 'account',
    isGuest: mode === 'guest',
  };
}
