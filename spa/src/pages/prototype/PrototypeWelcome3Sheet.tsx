/**
 * The one-time hello for people whose Harvous became 3.0 underneath them.
 *
 * ## Why this is not a toast
 *
 * `PrototypeAppUpdateToast` says "Harvous was updated" and offers a reload, which is the right
 * size for a patch. This release renames the three surfaces people navigate by — Home became
 * Activity, the sidebar became Search, Recall became Suggestions — so someone who dismisses a
 * pill and carries on finds their app rearranged with no explanation on offer. That is worth a
 * modal exactly once, and worth nothing at all afterwards.
 *
 * ## Who sees it
 *
 * Only a browser that was running Harvous before this build, which is a question that has to be
 * answered before the bundle loads — see `PROTO_UPGRADED_FROM_2_KEY`. Someone signing up at 3.0
 * has no 2.0 to be welcomed from; they get the onboarding checklist instead, which is the
 * surface that actually introduces the app.
 *
 * ## The numeral
 *
 * Copied from the `/3/` page on harvous.com (`src/pages/3.astro`), deliberately rather than
 * shared: two repos with no build relationship, and a traced glyph outline is a constant. It is
 * the Google Sans Flex "3" at ROND 100 / weight 700, pulled out with fontTools — so it needs no
 * font loaded here, and it is the same shape the marketing page draws. If the site's hero
 * changes, this is the other copy.
 *
 * ## Two ways out to what changed
 *
 * Side by side, because they are the same kind of thing: the release page is the story of 3.0,
 * the notes are the itemised list. The accent fill marks which one most people want rather
 * than a difference in kind.
 *
 * That leaves no button that simply closes, which is why there is a corner ×. Both buttons
 * open a tab, so without it the only way to say "neither, thanks" would be Escape — a key
 * nobody has on a phone.
 */
import Icon from '@/components/react/Icon';
import Harvous3Numeral from './Harvous3Numeral';
import { appVersion } from '@/utils/app-version';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useReleaseNotesUrl } from '../../hooks/useReleaseNotesUrl';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { PROTO_VOTD_SHEET_MOTION_MS } from '../../layouts/proto-motion';
import { setAppUpdateToastHold } from './welcome3-bridge';

/** The release page. Lives on the marketing site; opens in its own tab. */
const WHATS_NEW_URL = 'https://harvous.com/3/';

type Props = {
  open: boolean;
  onDismiss: () => void;
};

export default function PrototypeWelcome3Sheet({ open, onDismiss }: Props) {
  const { mounted, exiting } = useProtoOverlayMotion(open, {
    exitMs: PROTO_VOTD_SHEET_MOTION_MS,
  });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  /* This version's own page once the site confirms it has one, the index until then — never a
     404, which matters for a link that cannot be checked before it is offered. */
  const releaseNotesUrl = useReleaseNotesUrl(appVersion());

  /* Nothing opened this, so there is no trigger to hand focus back to. Restoring would send it
     to whatever happened to be focused as the app booted, which is arbitrary. */
  useProtoDialogFocus({
    open: mounted && !exiting,
    dialogRef,
    onDismiss,
    restoreFocus: false,
  });

  /* Hold the reload prompt for as long as this is up, and let go on the way out even if the
     unmount is the app tearing down rather than a dismissal. */
  useEffect(() => {
    if (!mounted) return undefined;
    setAppUpdateToastHold(true);
    return () => setAppUpdateToastHold(false);
  }, [mounted]);

  /* Reading the release page counts as having been welcomed — the same bargain the what's-new
     row makes. Coming back to a modal you just answered would be a bug, not a reminder. */
  const openWhatsNew = useCallback(() => {
    window.open(WHATS_NEW_URL, '_blank', 'noopener,noreferrer');
    onDismiss();
  }, [onDismiss]);

  const openReleaseNotes = useCallback(() => {
    window.open(releaseNotesUrl, '_blank', 'noopener,noreferrer');
    onDismiss();
  }, [onDismiss, releaseNotesUrl]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={[
        /* Portaled to body, so it sits outside `.proto-shell`'s `proto-theme` and would
           otherwise lose the conventions scoped to it — including the app's "no focus ring on
           buttons" rule, which is what puts a stray ring on the first control on open. */
        'proto-theme',
        'proto-votd-sheet-overlay',
        'proto-votd-sheet-overlay--motion',
        exiting ? 'proto-votd-sheet-overlay--exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={[
          'proto-welcome3',
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proto-welcome3-heading"
      >
        <div className="proto-welcome3__grid" aria-hidden="true" />

        <button
          type="button"
          className="proto-side-panel__action-btn proto-welcome3__close"
          aria-label="Close"
          onClick={onDismiss}
        >
          <Icon name="xmark" size={12} aria-hidden />
        </button>

        <div className="proto-welcome3__body">
          {/* Decorative: the heading below is the line that gets read out. */}
          <Harvous3Numeral />

          {/* Arrives once the numeral has started filling, not while it is still tracing.
              `data-proto-dialog-heading` is what `useProtoDialogFocus` looks for first: focus
              lands on the sentence rather than on a button wearing a focus ring. */}
          <h2
            id="proto-welcome3-heading"
            className="proto-welcome3__lead"
            data-proto-dialog-heading
            tabIndex={-1}
          >
            Harvous 3 is here.
          </h2>
          <p className="proto-welcome3__sub">
            Every note, highlight, and thread is where you left it. We just moved a few things
            around.
          </p>

          <div className="proto-welcome3__actions">
            <button type="button" className="proto-welcome3__cta" onClick={openWhatsNew}>
              See what&rsquo;s new
            </button>
            <button type="button" className="proto-welcome3__secondary" onClick={openReleaseNotes}>
              See release notes
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
