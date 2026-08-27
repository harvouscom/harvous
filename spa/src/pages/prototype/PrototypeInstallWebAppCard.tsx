import { useCallback, useState } from 'react';
import Icon from '@/components/react/Icon';
import { isPWA } from '@/utils/content-list-helpers';
import { getInstallPlatform } from '@/utils/platform-detect';
import {
  PROTO_INSTALL_WEB_APP_DISMISSED_KEY,
  PROTO_INSTALL_WEB_APP_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useDismissibleFlag } from './useDismissibleFlag';
import PrototypeInstallWebAppSheet from './PrototypeInstallWebAppSheet';

/** One-time mobile home card — Add to Home Screen until the user dismisses it. */
export default function PrototypeInstallWebAppCard() {
  const { isMobileSidebar } = useProtoShell();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [platform] = useState(() => getInstallPlatform());
  const [visible, dismissFlag] = useDismissibleFlag(PROTO_INSTALL_WEB_APP_DISMISSED_KEY, {
    previewKey: PROTO_INSTALL_WEB_APP_PREVIEW_KEY,
    eligible: isMobileSidebar && !isPWA(),
  });

  const dismiss = useCallback(() => {
    setSheetOpen(false);
    dismissFlag();
  }, [dismissFlag]);

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

        <button
          type="button"
          className="proto-install-web-app-card__learn"
          aria-label="Learn how to add Harvous to your home screen"
          onClick={() => setSheetOpen(true)}
        >
          Learn how
          <Icon name="caret-right" size={10} aria-hidden />
        </button>
      </div>

      <PrototypeInstallWebAppSheet open={sheetOpen} onClose={() => setSheetOpen(false)} platform={platform} />
    </>
  );
}
