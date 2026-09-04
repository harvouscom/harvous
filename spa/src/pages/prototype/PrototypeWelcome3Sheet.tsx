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
          <svg
            className="proto-welcome3__numeral"
            viewBox="-24 -24 1054 1522"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              {/* The site's --accent-btn-bg, linear-gradient(171deg, #2bb5ff 7%, #006eff 93%),
                  restated in objectBoundingBox space. Hardcoded because an SVG gradient
                  cannot read a CSS one. */}
              <linearGradient id="proto-welcome3-grad" x1="0" y1="0" x2="0.16" y2="1">
                <stop offset="7%" stopColor="#2bb5ff" />
                <stop offset="93%" stopColor="#006eff" />
              </linearGradient>
            </defs>
            <path
              className="proto-welcome3__numeral-path"
              pathLength="1"
              fill="url(#proto-welcome3-grad)"
              stroke="url(#proto-welcome3-grad)"
              strokeWidth="28"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M509 1474Q362 1474 261 1436Q161 1398 100 1337Q39 1276 14 1214Q-11 1156 9 1094Q30 1033 81 1008Q132 983 181 996Q231 1010 262 1058Q278 1092 302 1122Q327 1152 367 1170Q406 1188 471 1188Q545 1188 599 1142Q654 1096 654 1012Q654 936 598 889Q543 842 434 842H412Q361 842 327 805Q293 768 293 718Q293 668 327 631Q362 594 414 594H435Q534 594 580 552Q625 508 625 444Q625 370 582 330Q539 290 470 290Q420 290 389 302Q359 314 334 338Q310 362 291 395Q262 436 214 448Q166 462 116 439Q65 416 45 359Q25 301 55 242Q89 176 150 120Q212 64 298 32Q385 0 512 0Q703 0 825 96Q947 192 947 359Q947 468 889 552Q830 636 722 674Q849 702 927 796Q1006 889 1006 1026Q1006 1218 868 1346Q730 1474 509 1474Z"
            />
          </svg>

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
            Every note, highlight, and thread is where you left it. We moved a few things
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
