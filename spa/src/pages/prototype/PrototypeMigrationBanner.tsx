import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import {
  PROTO_MIGRATION_BANNER_DISMISSED_KEY,
  PROTO_MIGRATION_BANNER_PREVIEW_KEY,
  PROTO_MIGRATION_DONE_KEY,
} from '../../layouts/proto-session-keys';
import { refreshPrototypeLists } from '../../lib/refresh-client-data';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  fetchPrototypeMigrationStatus,
  usePrototypeMigration,
} from '../../hooks/mutations/usePrototypeMigration';
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

export default function PrototypeMigrationBanner() {
  const queryClient = useQueryClient();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const migrate = usePrototypeMigration();
  const [visible, setVisible] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    const run = async () => {
      if (import.meta.env.DEV && readFlag(PROTO_MIGRATION_BANNER_PREVIEW_KEY)) {
        setVisible(true);
        return;
      }

      if (readFlag(PROTO_MIGRATION_BANNER_DISMISSED_KEY)) return;

      const migrationDone = readFlag(PROTO_MIGRATION_DONE_KEY);
      if (!migrationDone) {
        setMigrating(true);
        try {
          const result = await migrate.mutateAsync();
          writeFlag(PROTO_MIGRATION_DONE_KEY);
          if (cancelled) return;
          await refreshPrototypeLists(queryClient, homeSpaceId);
          if (result.showFoldersBanner) {
            setVisible(true);
          }
        } catch {
          /* silent — user can still use notes; admin batch can backfill later */
        } finally {
          if (!cancelled) setMigrating(false);
        }
        return;
      }

      try {
        const status = await fetchPrototypeMigrationStatus();
        if (!cancelled && status.needsCollectionBackfill) {
          setVisible(true);
        }
      } catch {
        /* ignore */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

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
