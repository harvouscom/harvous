/**
 * The guest's standing notice: what mode this is, and the way out of it.
 *
 * Shaped after `PrototypeSharedNoteReadOnlyBanner` rather than the deprecated `PrototypeBanner`
 * — a slim `role="status"` row with a caption and one trailing control. That component exists to
 * answer "what mode am I in, and what can I not do here", which is this question exactly.
 *
 * It renders above the shell frame, at the `#root` layer, with no surface of its own: the
 * canvas or the wallpaper runs straight through it and the app shell below is exactly the
 * shell, moved down as one object.
 *
 * **Not dismissible, unlike every other one-time surface here.** Those say a thing once — a
 * letter, a release note, an install tip — and putting them away means "I have read it". This
 * is not a message, it is the state of the session: a guest is in guest mode for as long as
 * they are in it, and a bar that reports that cannot be switched off any more than the mode
 * can. It is also the only place on a reading screen that says where this work lives.
 *
 * **The copy is the honest one.** A guest's notes are in IndexedDB, so they survive a tab close,
 * a reload, and a laptop lid; what they do not survive is a different browser, a cleared cache,
 * or a phone. "Save before you lose your work" would have been the easier line and a false one,
 * and a first impression built on a false alarm is a bad trade for a signup. Which is why the
 * button says what it gives ("free account") rather than what you might lose — the same reason
 * the row states the mode and stops there.
 */
import { useCallback, useEffect } from 'react';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';

export default function PrototypeGuestModeRow({ enabled }: { enabled: boolean }) {
  const handleCreate = useCallback(() => {
    leaveForSignUp();
  }, []);

  /*
    The frame gives up its top inset only while this row is above it — see
    `html.harvous-proto-guest` in prototype-shell.css. Asserted here rather than at the shell
    because this component is the one that knows whether the row is on screen at all.
    `prototype-route-boot.js` sets the same class pre-paint; this keeps it honest afterwards.
  */
  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.classList.add('harvous-proto-guest');
    else root.classList.remove('harvous-proto-guest');
    return () => root.classList.remove('harvous-proto-guest');
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="proto-guest-row" role="status" aria-live="polite">
      <span className="proto-guest-row__status pds-caption">
        {/*
          The state, and only the state. Everything about where notes live moved out: the row
          says which mode you are in, the button says what it offers, and the sheet on Home has
          the room to explain. A status line is a bad place for an argument.
        */}
        <span className="proto-guest-row__label">You&rsquo;re trying Harvous</span>
      </span>
      <span className="proto-guest-row__trail">
        <a className="proto-accent-btn-sm" href={guestSignUpHref()} onClick={handleCreate}>
          Create free account
        </a>
      </span>
    </div>
  );
}
