import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { api } from '../../lib/api';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import PrototypeSearchInput from './components/PrototypeSearchInput';

export interface ConnectNoteCandidate {
  id: string;
  title: string;
  noteType: string;
}

interface ConnectNoteCandidatesResponse {
  notes: ConnectNoteCandidate[];
}

export interface PrototypeConnectNoteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  parentNoteId: string;
}

function normalizedSpacePathId(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

export default function PrototypeConnectNoteSheet({
  open,
  onOpenChange,
  spaceId,
  parentNoteId,
}: PrototypeConnectNoteSheetProps) {
  const { input: searchInput, setInput: setSearchInput, debounced, clear } = useDebouncedSearchState(280);
  const connectMutation = useConnectNote();

  const sidPath = normalizedSpacePathId(spaceId);
  const debouncedTrim = debounced.trim();

  useEffect(() => {
    if (!open) clear();
  }, [open, clear]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['connectNoteCandidates', sidPath, parentNoteId, debouncedTrim] as const,
    queryFn: () =>
      api.get<ConnectNoteCandidatesResponse>(
        `/api/spaces/${encodeURIComponent(sidPath)}/connect-note-candidates`,
        {
          q: debouncedTrim,
          excludeNoteId: parentNoteId,
          limit: 15,
        },
      ),
    enabled: open && debouncedTrim.length >= 1,
    staleTime: 5_000,
  });

  const notes = data?.notes ?? [];
  const showEmpty = debouncedTrim.length >= 1 && !isLoading && notes.length === 0;
  const showHint = debouncedTrim.length === 0;

  const handlePick = (linkedNoteId: string) => {
    connectMutation.mutate(
      { parentNoteId, linkedNoteId, spaceId },
      {
        onSuccess: () => {
          onOpenChange(false);
          try {
            window.toast?.success('Note connected');
          } catch {
            /* ignore */
          }
        },
      },
    );
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet"
      >
        <div className="proto-connect-note-sheet__header">
          <h2 className="proto-connect-note-sheet__title">Connect note</h2>
          <p className="proto-connect-note-sheet__subtitle">Pick a note in this space to link here.</p>
        </div>
        <PrototypeSearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search notes…"
          autoFocus={open}
        />
        <div className="proto-connect-note-sheet__scroll" role="region" aria-label="Matching notes">
          {showHint ? (
            <p className="proto-connect-note-sheet__hint">Type at least one character to search by title.</p>
          ) : null}
          {debouncedTrim.length >= 1 && (isLoading || isFetching) && notes.length === 0 ? (
            <p className="proto-connect-note-sheet__hint">Searching…</p>
          ) : null}
          {showEmpty ? <p className="proto-connect-note-sheet__hint">No notes match.</p> : null}
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              disabled={connectMutation.isPending}
              className="proto-connect-note-sheet__row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(n.id)}
            >
              <span className="proto-connect-note-sheet__row-title">
                {(n.title ?? '').trim() || 'Untitled note'}
              </span>
            </button>
          ))}
        </div>
        <div className="proto-connect-note-sheet__footer">
          <button
            type="button"
            className="proto-connect-note-sheet__cancel"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
        </div>
      </DrawerContent>
    </Drawer.Root>
  );
}
