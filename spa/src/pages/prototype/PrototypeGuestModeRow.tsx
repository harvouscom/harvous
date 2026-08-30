/**
 * The guest's standing notice: what mode this is, and where their work lives.
 *
 * Shaped after `PrototypeSharedNoteReadOnlyBanner` rather than the deprecated `PrototypeBanner`
 * — a slim `role="status"` row with a caption and one trailing control. That component exists to
 * answer "what mode am I in, and what can I not do here", which is this question exactly.
 *
 * **The copy is the honest one.** A guest's notes are in IndexedDB, so they survive a tab close,
 * a reload, and a laptop lid; what they do not survive is a different browser, a cleared cache,
 * or a phone. "Save before you lose your work" would have been the easier line and a false one,
 * and a first impression built on a false alarm is a bad trade for a signup.
 *
 * Unlike the install-web-app card it borrows `useDismissibleFlag` from, this is not mobile-only:
 * a guest on a desktop is in exactly the same position as a guest on a phone.
 */
import { useCallback, useEffect } from 'react';
import Icon from '@/components/react/Icon';
import {
  PROTO_GUEST_ROW_DISMISSED_KEY,
  PROTO_GUEST_ROW_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useDismissibleFlag } from './useDismissibleFlag';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';

export default function PrototypeGuestModeRow({ enabled }: { enabled: boolean }) {
  const [visible, dismiss] = useDismissibleFlag(PROTO_GUEST_ROW_DISMISSED_KEY, {
    previewKey: PROTO_GUEST_ROW_PREVIEW_KEY,
    eligible: enabled,
  });

  const handleCreate = useCallback(() => {
    leaveForSignUp();
  }, []);

  /*
    The row lives above the shell frame, so its height has to come off the frame rather than out
    of the grid — see `html.harvous-proto-guest` in prototype-shell.css. The class is asserted
    here rather than at the shell because this component is the only thing that knows whether the
    row is actually on screen: dismissing it must give the 34px back, not leave an empty band.
    `prototype-route-boot.js` sets the same class pre-paint; this keeps it honest afterwards.
  */
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.classList.add('harvous-proto-guest');
    else root.classList.remove('harvous-proto-guest');
    return () => root.classList.remove('harvous-proto-guest');
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="proto-guest-row" role="status" aria-live="polite">
      <span className="proto-guest-row__status pds-caption">
        <Icon name="circle-user" size={11} className="proto-guest-row__icon" aria-hidden />
        <span className="proto-guest-row__label">
          You&rsquo;re trying Harvous — notes are saved on this device only
        </span>
      </span>
      <span className="proto-guest-row__trail">
        <a
          className="proto-guest-row__action"
          href={guestSignUpHref()}
          onClick={handleCreate}
        >
          Create free account
        </a>
        {/*
          Safe to put away because it is not the only door: the toolbar's account control is a
          guest's permanent way in (see `AccountMenu`). A notice you cannot dismiss becomes
          furniture people read past, which is worse for the thing it is asking.
        */}
        <button
          type="button"
          className="proto-guest-row__dismiss"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <Icon name="xmark" size={11} aria-hidden />
        </button>
      </span>
    </div>
  );
}
