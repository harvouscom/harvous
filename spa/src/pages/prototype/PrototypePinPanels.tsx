/**
 * Shell host for the note PIN sheet — choose a PIN and lock, lock with the account PIN,
 * or confirm the PIN to remove a lock. Opened by `openPinEntryPanel` (dispatched from
 * LockNoteButton, which the note menu and Mod+Shift+L drive); closed by the panel itself.
 *
 * Mounted on every route, so it stays small: it listens, and loads the sheet chunk the
 * first time a PIN is actually asked for.
 *
 * Also the one place that refreshes list-level caches when a note's lock changes: the
 * note page refetches its own detail, but the row icon, the "Locked" preview and the
 * History / Share gates read from space, thread and navigation caches.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PinEntryPanelInitialMode } from '@/components/react/PinEntryPanel';
import { navigationQueryKeyPrefix } from '../../hooks/queries/useNavigation';
import { noteHistoryQueryKey } from '../../hooks/queries/useNoteHistory';

const PrototypePinSheet = lazy(() => import('./PrototypePinSheet'));

export type PinRequest = {
  noteId: string;
  mode: PinEntryPanelInitialMode;
  noteContent: string;
  isEncrypted: boolean;
};

const SUPPORTED_MODES: ReadonlySet<string> = new Set(['setForAccount', 'lockWithAccountPin', 'removeLock']);

export default function PrototypePinPanels() {
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<PinRequest | null>(null);
  /** Bumped per open so a second request remounts the panel at its first step. */
  const [openKey, setOpenKey] = useState(0);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<Partial<PinRequest>>).detail;
      if (!d?.noteId || !d.mode || !SUPPORTED_MODES.has(d.mode)) return;
      setRequest({
        noteId: String(d.noteId),
        mode: d.mode,
        noteContent: d.noteContent ?? '',
        isEncrypted: d.isEncrypted === true,
      });
      setOpenKey((k) => k + 1);
    };
    const onClose = () => setRequest(null);
    window.addEventListener('openPinEntryPanel', onOpen);
    window.addEventListener('closePinEntryPanel', onClose);
    return () => {
      window.removeEventListener('openPinEntryPanel', onOpen);
      window.removeEventListener('closePinEntryPanel', onClose);
    };
  }, []);

  useEffect(() => {
    const onLockChanged = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          noteId?: string;
          contentEncrypted?: boolean;
          contentEncryptedServer?: boolean;
          newContent?: string;
        }>
      ).detail;
      const noteId = detail?.noteId;
      // The server's state, not the view's: opening a locked note also announces itself
      // here, with `contentEncrypted: false` but `contentEncryptedServer: true`.
      const serverEncrypted = detail?.contentEncryptedServer ?? detail?.contentEncrypted;
      // Flip the detail cache now, not when the refetch lands. useUpdateNote decides whether
      // to encrypt a save from this cache, so a stale "locked" after Remove lock would
      // encrypt the next autosave into a note the server now stores as plain text.
      if (noteId && typeof serverEncrypted === 'boolean') {
        const encrypted = serverEncrypted;
        queryClient.setQueriesData<Record<string, unknown>>({ queryKey: ['note', noteId] }, (prev) =>
          prev
            ? {
                ...prev,
                contentEncrypted: encrypted,
                ...(typeof detail?.newContent === 'string'
                  ? { content: detail.newContent, __contentIsPreview: false }
                  : {}),
                ...(encrypted ? { isPublic: false, shareToken: null, coEditEnabled: false } : {}),
              }
            : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['space'] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      if (noteId) {
        queryClient.invalidateQueries({ queryKey: ['note', noteId] });
        queryClient.invalidateQueries({ queryKey: noteHistoryQueryKey(noteId) });
      }
    };
    // Set, changed or removed. A change re-encrypts every locked note, so their cached
    // ciphertext is stale too.
    const onPinChanged = () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['note'] });
    };
    window.addEventListener('noteLockStateChanged', onLockChanged);
    window.addEventListener('lockPinSet', onPinChanged);
    return () => {
      window.removeEventListener('noteLockStateChanged', onLockChanged);
      window.removeEventListener('lockPinSet', onPinChanged);
    };
  }, [queryClient]);

  // Nothing to load until the first request; after that the sheet stays mounted so its
  // exit animation can play.
  if (openKey === 0) return null;

  return (
    <Suspense fallback={null}>
      <PrototypePinSheet request={request} openKey={openKey} onClose={() => setRequest(null)} />
    </Suspense>
  );
}
