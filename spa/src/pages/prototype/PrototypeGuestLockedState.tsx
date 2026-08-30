/**
 * What a guest finds where a surface needs an account.
 *
 * Built on `PrototypePaneEmptyState`, the same primitive Home, admin and the route errors use,
 * because that is what the design law leaves open: persistent chrome is inline rows and empty
 * states, never an overlay or a tinted alert bar. A locked surface is an empty state whose
 * reason happens to be "not yet" rather than "nothing here".
 *
 * The copy names what the surface *does* before it names what it needs. A wall that only says
 * "sign up" is asking someone to pay for a room they have not been shown; saying what Activity
 * remembers, or what Recall brings back, is the actual argument — and it is the honest one,
 * because it is the same sentence we would use to describe the feature to anyone.
 *
 * Work already on this device is counted out loud where there is any. "3 highlights are waiting
 * on this device" is a far better reason to make an account than any adjective, and it is the
 * one line here that is different for every reader.
 */
import PrototypePaneEmptyState from './PrototypePaneEmptyState';
import type { IconName } from '@/components/react/Icon';
import { useSyncExternalStore } from 'react';
import {
  guestStoreCounts,
  guestStoreServerSnapshot,
  guestStoreSnapshot,
  subscribeToGuestStore,
} from '../../lib/guest-store';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';

function waitingLine(): string | null {
  const { notes, highlights } = guestStoreCounts();
  const parts: string[] = [];
  if (highlights > 0) parts.push(`${highlights} highlight${highlights === 1 ? '' : 's'}`);
  if (notes > 0) parts.push(`${notes} note${notes === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  return `${parts.join(' and ')} ${parts.length === 1 && !parts[0].endsWith('s') ? 'is' : 'are'} waiting on this device.`;
}

export default function PrototypeGuestLockedState({
  icon = 'circle-user',
  title,
  what,
}: {
  icon?: IconName;
  /** The surface's own name, as a heading — "Your study, remembered". */
  title: string;
  /** One sentence on what this surface does once there is an account to do it for. */
  what: string;
}) {
  // Re-read on every store write, so the count below is never stale by a highlight.
  useSyncExternalStore(subscribeToGuestStore, guestStoreSnapshot, guestStoreServerSnapshot);
  const waiting = waitingLine();

  return (
    <PrototypePaneEmptyState
      icon={icon}
      title={title}
      description={
        <>
          <p className="proto-editor-empty-state__line">{what}</p>
          {waiting ? <p className="proto-editor-empty-state__line">{waiting}</p> : null}
        </>
      }
      action={{
        label: 'Create free account',
        onClick: () => {
          leaveForSignUp();
          window.location.href = guestSignUpHref();
        },
      }}
    />
  );
}
