import { lazy, Suspense, useCallback, useState } from 'react';
import Icon from '@/components/react/Icon';
import { isPWA } from '@/utils/content-list-helpers';
import { useInstallPrompt } from '../../lib/install-prompt';
import { getInstallPlatform } from '@/utils/platform-detect';
import {
  PROTO_INSTALL_WEB_APP_DISMISSED_KEY,
  PROTO_INSTALL_WEB_APP_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useDismissibleFlag } from './useDismissibleFlag';
/*
  The card is on Home for every mobile session that has not dismissed it; the
  sheet behind "Learn how" is opened by a fraction of them. Split, so the steps,
  their glyphs and the brand marks are fetched on the tap that asks for them.
*/
const PrototypeInstallWebAppSheet = lazy(() => import('./PrototypeInstallWebAppSheet'));

/** One-time mobile home card — Add to Home Screen until the user dismisses it. */
export default function PrototypeInstallWebAppCard() {
  const { isMobileSidebar } = useProtoShell();
  const [sheetOpen, setSheetOpen] = useState(false);
  /* Mounted from the first "Learn how" onward, not only while open: the sheet
     animates itself out, and unmounting it the instant `open` flips false would
     cut that exit off. Before the first tap it is not mounted at all, which is
     the point of the split. */
  const [sheetRequested, setSheetRequested] = useState(false);
  const [platform] = useState(() => getInstallPlatform());
  /*
    Chrome hands us its own install prompt on Android. When we are holding one,
    the card asks for the install directly — the steps below exist because iOS
    has no such thing, and making an Android reader read three of them when one
    tap would do is the app declining a shortcut it was given.
  */
  const { canInstall, install } = useInstallPrompt();
  const [visible, dismissFlag] = useDismissibleFlag(PROTO_INSTALL_WEB_APP_DISMISSED_KEY, {
    previewKey: PROTO_INSTALL_WEB_APP_PREVIEW_KEY,
    eligible: isMobileSidebar && !isPWA(),
  });

  const dismiss = useCallback(() => {
    setSheetOpen(false);
    dismissFlag();
  }, [dismissFlag]);

  /* Accepted: the card has done its job and should not outlive the install.
     Dismissed: the prompt is spent, `canInstall` flips false on its own, and
     the card falls back to the written steps — Chrome offers a fresh prompt on
     a later visit. */
  const installNow = useCallback(() => {
    void install().then((outcome) => {
      if (outcome === 'accepted') dismissFlag();
    });
  }, [install, dismissFlag]);

  if (!visible) return null;

  return (
    <>
      <div
        className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-install-web-app-card"
        role="region"
        aria-label="Add Harvous to your home screen for a more app-like experience"
      >
        <button type="button" className="proto-daily-passage-pill__dismiss" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="xmark" size={10} aria-hidden />
          <span>Dismiss</span>
        </button>

        <p className="proto-install-web-app-card__heading">
          Add Harvous to your home screen
          <br />
          for a more app-like experience
        </p>

        {canInstall ? (
          <button
            type="button"
            className="proto-share-popover__primary proto-install-web-app-card__install"
            onClick={installNow}
          >
            Install
          </button>
        ) : null}

        <button
          type="button"
          className="proto-install-web-app-card__learn"
          aria-label="Learn how to add Harvous to your home screen"
          onClick={() => {
            setSheetRequested(true);
            setSheetOpen(true);
          }}
        >
          {/* Kept beside the one-tap path rather than replaced by it: a reader
              who wants to know what the button is about to do still has a way
              to look before they tap. */}
          {canInstall ? 'What this does' : 'Learn how'}
          <Icon name="caret-right" size={10} aria-hidden />
        </button>
      </div>

      {/* No fallback: the sheet paints its own card, and a placeholder would
          flash where it is about to be. */}
      {sheetRequested ? (
        <Suspense fallback={null}>
          <PrototypeInstallWebAppSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            platform={platform}
            onInstalled={dismissFlag}
          />
        </Suspense>
      ) : null}
    </>
  );
}
