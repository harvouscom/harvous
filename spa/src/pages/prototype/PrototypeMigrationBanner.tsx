import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  PROTO_MIGRATION_BANNER_DISMISSED_KEY,
  PROTO_MIGRATION_BANNER_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useProtoMigration } from '../../layouts/proto-migration-context';
import PrototypeMigrationSheet from './PrototypeMigrationSheet';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

/** Informational only — migration runs from ProtoMigrationProvider on layout mount. */
export default function PrototypeMigrationBanner() {
  const { migrating, showFoldersBanner } = useProtoMigration();
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV && readFlag(PROTO_MIGRATION_BANNER_PREVIEW_KEY)) {
      setVisible(true);
      return;
    }
    if (readFlag(PROTO_MIGRATION_BANNER_DISMISSED_KEY)) return;
    if (showFoldersBanner) {
      setVisible(true);
    }
  }, [showFoldersBanner]);

  const dismiss = useCallback(() => {
    writeFlag(PROTO_MIGRATION_BANNER_DISMISSED_KEY);
    setSheetOpen(false);
    setVisible(false);
  }, []);

  if (migrating || !visible) return null;

  return (
    <>
      <div className="proto-migration-pill proto-daily-passage-pill" role="region" aria-label="Folders update">
        <button type="button" className="proto-daily-passage-pill__dismiss" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="xmark" size={10} aria-hidden />
          <span>Dismiss</span>
        </button>

        <div className="proto-daily-passage-pill__content proto-daily-passage-pill__content--no-add">
          <p className="proto-caption proto-daily-passage-pill__eyebrow">What&apos;s new</p>
          <p className="pds-list-title proto-daily-passage-pill__reference">Old threads are now folders</p>
        </div>

        <div className="proto-daily-passage-pill__orbs">
          <button
            type="button"
            className="proto-daily-passage-pill__orb"
            aria-label="Learn more about folders and threads"
            onClick={() => setSheetOpen(true)}
          >
            <Icon name="circle-info" size={12} />
          </button>
        </div>
      </div>

      <PrototypeMigrationSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
