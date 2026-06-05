import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  PROTO_MIGRATION_BANNER_DISMISSED_KEY,
  PROTO_MIGRATION_DONE_KEY,
} from '../../layouts/proto-session-keys';
import { refreshPrototypeLists } from '../../lib/refresh-client-data';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  fetchPrototypeMigrationStatus,
  usePrototypeMigration,
} from '../../hooks/mutations/usePrototypeMigration';

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
  const { setSidebarListMode, ensureSidebarExpanded } = useProtoShell();
  const migrate = usePrototypeMigration();
  const [visible, setVisible] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    const run = async () => {
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
    setVisible(false);
  }, []);

  const openFolders = useCallback(() => {
    ensureSidebarExpanded();
    setSidebarListMode('folders');
    dismiss();
  }, [dismiss, ensureSidebarExpanded, setSidebarListMode]);

  if (migrating || !visible) return null;

  return (
    <div className="proto-migration-notice">
      <div className="proto-migration-notice__card" role="region" aria-label="Folders update">
        <button type="button" className="proto-migration-notice__dismiss" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="xmark" size={10} aria-hidden />
          <span>Dismiss</span>
        </button>

        <div className="proto-migration-notice__content">
          <p className="proto-caption proto-migration-notice__eyebrow">What&apos;s new</p>
          <p className="pds-list-title proto-migration-notice__title">Your thread piles are now folders</p>
          <p className="pds-list-preview proto-migration-notice__text">
            Open <strong>Folders</strong> in the sidebar to browse notes by your former thread titles. Use{' '}
            <strong>Threads</strong> when you want to connect related notes into a study chain.
          </p>
        </div>

        <button
          type="button"
          className="proto-migration-notice__orb"
          aria-label="Show folders"
          onClick={openFolders}
        >
          <Icon name="folder" size={12} />
        </button>
      </div>
    </div>
  );
}
