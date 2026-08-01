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
import { APIError } from '../lib/api';

type ProtoMigrationContextValue = {
  migrating: boolean;
  lastResult: PrototypeMigrationResult | null;
};

const ProtoMigrationContext = createContext<ProtoMigrationContextValue>({
  migrating: false,
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
  const [lastResult, setLastResult] = useState<PrototypeMigrationResult | null>(null);
  const startedRef = useRef(false);

  const runMigrationIfNeeded = useCallback(async () => {
    setMigrating(true);
    try {
      // Probe first, and never let its failure reach the migration catch below.
      // A transient GET failure on boot (cold start, DB blip, dropped connection)
      // is not a failed folder update — nothing has been attempted yet — but it
      // used to raise the same alarming toast. Skip the session instead.
      let status: Awaited<ReturnType<typeof fetchPrototypeMigrationStatus>>;
      try {
        status = await fetchPrototypeMigrationStatus();
      } catch (statusError) {
        console.warn('[proto-migration] status probe failed; skipping this session:', statusError);
        return;
      }

      if (!status.needsCollectionBackfill) {
        writeMigrationDoneFlag();
        return;
      }

      const result = await migrate.mutateAsync();
      setLastResult(result);

      const stillNeedsBackfill = result.needsCollectionBackfill ?? false;
      if (!stillNeedsBackfill) {
        writeMigrationDoneFlag();
      }

      // Outside the try below by design: the migration has already succeeded at this point,
      // so a cache-refresh hiccup must not tell the user their folder update failed.
      try {
        await refreshPrototypeLists(queryClient, homeSpaceId);
      } catch (refreshError) {
        console.warn('[proto-migration] list refresh after migration failed:', refreshError);
      }
    } catch (error) {
      // Only the migration write can reach here — the status probe handles its own
      // failure above, so this toast always refers to work actually attempted.
      if (error instanceof APIError && (error.status === 503 || error.code === 'SCHEMA_NOT_READY')) {
        return;
      }
      const raw = error instanceof Error ? error.message : '';
      const message =
        raw.includes('NoteConnections') || raw.includes('SCHEMA_NOT_READY')
          ? 'Folder update is not ready yet — try again soon'
          : 'Could not finish the folder update — your notes are safe';
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
    () => ({ migrating, lastResult }),
    [migrating, lastResult],
  );

  return <ProtoMigrationContext.Provider value={value}>{children}</ProtoMigrationContext.Provider>;
}

export function useProtoMigration(): ProtoMigrationContextValue {
  return useContext(ProtoMigrationContext);
}
