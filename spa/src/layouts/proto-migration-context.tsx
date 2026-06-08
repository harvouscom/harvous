import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { toast } from '@/utils/toast';
import { PROTO_MIGRATION_DONE_KEY } from './proto-session-keys';
import { refreshPrototypeLists } from '../lib/refresh-client-data';
import { usePrototypeHomeSpaceId } from '../hooks/usePrototypeHomeSpaceId';
import {
  fetchPrototypeMigrationStatus,
  usePrototypeMigration,
  type PrototypeMigrationResult,
} from '../hooks/mutations/usePrototypeMigration';

type ProtoMigrationContextValue = {
  migrating: boolean;
  showFoldersBanner: boolean;
  lastResult: PrototypeMigrationResult | null;
};

const ProtoMigrationContext = createContext<ProtoMigrationContextValue>({
  migrating: false,
  showFoldersBanner: false,
  lastResult: null,
});

function writeMigrationDoneFlag(): void {
  try {
    localStorage.setItem(PROTO_MIGRATION_DONE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function ProtoMigrationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const migrate = usePrototypeMigration();
  const [migrating, setMigrating] = useState(false);
  const [showFoldersBanner, setShowFoldersBanner] = useState(false);
  const [lastResult, setLastResult] = useState<PrototypeMigrationResult | null>(null);
  const startedRef = useRef(false);

  const runMigrationIfNeeded = useCallback(async () => {
    setMigrating(true);
    try {
      const status = await fetchPrototypeMigrationStatus();
      if (!status.needsCollectionBackfill) {
        writeMigrationDoneFlag();
        return;
      }

      const result = await migrate.mutateAsync();
      setLastResult(result);
      await refreshPrototypeLists(queryClient, homeSpaceId);

      const stillNeedsBackfill = result.needsCollectionBackfill ?? false;
      if (!stillNeedsBackfill) {
        writeMigrationDoneFlag();
      }

      if (result.showFoldersBanner) {
        setShowFoldersBanner(true);
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      const message = raw.includes('NoteConnections') || raw.includes('SCHEMA_NOT_READY')
        ? 'Folder migration is not ready yet. Please try again later.'
        : 'Could not finish folder migration. Your notes are safe — we will retry.';
      toast.error(message);
    } finally {
      setMigrating(false);
    }
  }, [homeSpaceId, migrate, queryClient]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void runMigrationIfNeeded();
  }, [isLoaded, isSignedIn, runMigrationIfNeeded]);

  const value = useMemo(
    () => ({ migrating, showFoldersBanner, lastResult }),
    [migrating, showFoldersBanner, lastResult],
  );

  return <ProtoMigrationContext.Provider value={value}>{children}</ProtoMigrationContext.Provider>;
}

export function useProtoMigration(): ProtoMigrationContextValue {
  return useContext(ProtoMigrationContext);
}
