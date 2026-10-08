/**
 * When this account was created, for the callouts' "is this news to you" rules.
 *
 * Read from Clerk's user, which the shell already has loaded. A guest has no account and gets
 * `undefined` — new to everything, so no "what changed" cards. `ready` is false until Clerk has
 * answered, so a card does not flash for someone it turns out not to be news to.
 */
import { useUser } from '@clerk/clerk-react';
import { useHarvousIdentity } from '../../../hooks/useHarvousIdentity';

/** An account this young is still being introduced to the app, not told what changed in it. */
export const NEW_ACCOUNT_MS = 14 * 24 * 60 * 60 * 1000;

export function useAccountCreatedAt(): { ready: boolean; createdAt: number | undefined } {
  const { isGuest } = useHarvousIdentity();
  const { isLoaded, user } = useUser();
  if (isGuest) return { ready: true, createdAt: undefined };
  if (!isLoaded) return { ready: false, createdAt: undefined };
  const raw = user?.createdAt;
  const ms = raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : Number.NaN;
  return { ready: true, createdAt: Number.isFinite(ms) ? ms : undefined };
}
