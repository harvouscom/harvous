/**
 * The guest's standing notice: what mode this is, and where their work lives.
 *
 * Shaped after `PrototypeSharedNoteReadOnlyBanner` rather than the deprecated `PrototypeBanner`
 * — a slim `role="status"` row with a caption and one trailing control. That component exists to
 * answer "what mode am I in, and what can I not do here", which is this question exactly.
 *
 * It renders *inside* the shell frame, above the toolbar. Sitting above the frame instead left
 * the notice stranded on the canvas with the app's white card starting below it, which read as
 * a gap rather than as a bar — the shell has to move down as one object, not have a strip
 * balanced on top of it.
 *
 * **The copy is the honest one.** A guest's notes are in IndexedDB, so they survive a tab close,
 * a reload, and a laptop lid; what they do not survive is a different browser, a cleared cache,
 * or a phone. "Save before you lose your work" would have been the easier line and a false one,
 * and a first impression built on a false alarm is a bad trade for a signup. "to save" on the
 * button is the same claim at the right size: an account keeps this, rather than a warning that
 * something is about to be lost.
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
    The frame only becomes a flex column while this row is in it — see `html.harvous-proto-guest`
    in prototype-shell.css. The class is asserted here rather than at the shell because this
    component is the only thing that knows whether the row is actually on screen: dismissing it
    must hand the plain layout back. `prototype-route-boot.js` sets the same class pre-paint;
    this keeps it honest afterwards.
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
        <Icon name="id-card-clip" size={11} className="proto-guest-row__icon" aria-hidden />
        {/*
          The state, and only the state. The device clause moved onto the button, where "to
          save" says the same thing in three words and says it on the control that acts on it —
          a reason attached to the offer beats a reason sitting next to one.
        */}
        <span className="proto-guest-row__label">You&rsquo;re trying Harvous</span>
      </span>
      <span className="proto-guest-row__trail">
        <a
          className="proto-accent-btn-sm"
          href={guestSignUpHref()}
          onClick={handleCreate}
        >
          Create account to save
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
