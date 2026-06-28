import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import type { InstallPlatform } from '@/utils/platform-detect';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';

type Props = {
  open: boolean;
  onClose: () => void;
  platform: InstallPlatform;
};

function InstallStepsList({ children }: { children: ReactNode }) {
  return <ol className="proto-install-web-app-sheet__steps">{children}</ol>;
}

function IosSteps() {
  return (
    <InstallStepsList>
      <li>
        Tap the <strong>Share</strong> icon (square with arrow)
      </li>
      <li>
        Scroll down and tap <strong>Add to Home Screen</strong>
      </li>
      <li>
        Tap <strong>Add</strong>
      </li>
    </InstallStepsList>
  );
}

function AndroidSteps() {
  return (
    <InstallStepsList>
      <li>
        Tap the menu (<strong>⋮</strong>) in the top corner
      </li>
      <li>
        Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong>
      </li>
    </InstallStepsList>
  );
}

function sheetTitle(platform: InstallPlatform): string {
  if (platform === 'ios') return 'Add Harvous on iPhone';
  if (platform === 'android') return 'Add Harvous on Android';
  return 'Add Harvous to your home screen';
}

function sheetEyebrow(platform: InstallPlatform): string {
  if (platform === 'ios') return 'iPhone & iPad';
  if (platform === 'android') return 'Android';
  return 'Mobile browser';
}

export default function PrototypeInstallWebAppSheet({ open, onClose, platform }: Props) {
  const { mounted, exiting } = useProtoOverlayMotion(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={[
        'proto-votd-sheet-overlay',
        'proto-votd-sheet-overlay--motion',
        exiting ? 'proto-votd-sheet-overlay--exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={[
          'proto-votd-sheet',
          'proto-install-web-app-sheet',
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label={sheetTitle(platform)}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="proto-votd-sheet__header">
          <div className="proto-votd-sheet__header-text">
            <p className="proto-caption proto-votd-sheet__eyebrow">{sheetEyebrow(platform)}</p>
            <h2 className="proto-votd-sheet__reference">{sheetTitle(platform)}</h2>
          </div>
          <button
            type="button"
            className="proto-toolbar-icon-btn proto-votd-sheet__close"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="xmark" size={22} />
          </button>
        </header>

        <div className="proto-votd-sheet__divider" aria-hidden />

        <div className="proto-votd-sheet__body proto-install-web-app-sheet__body">
          {platform === 'ios' ? <IosSteps /> : null}
          {platform === 'android' ? <AndroidSteps /> : null}
          {platform === 'other' ? (
            <>
              <p className="proto-migration-sheet__text">
                <strong>iPhone (Safari)</strong>
              </p>
              <IosSteps />
              <p className="proto-migration-sheet__text">
                <strong>Android (Chrome)</strong>
              </p>
              <AndroidSteps />
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
