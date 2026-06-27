import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import { useCreateHighlight } from '../../hooks/mutations/useCreateHighlight';
import { navigationQueryKeyPrefix } from '../../hooks/queries/useNavigation';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { PrototypeAddNotesPicker, type AddNotesCandidate } from './PrototypeAddNotesSheet';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { computeAnchoredPopoverPosition } from './proto-anchored-popover-position';

export interface ConnectNoteAnchorInfo {
  sourceSnippet: string;
  anchorLocation: number;
  anchorLength: number;
  anchorTextSnapshot: string;
}

export interface PrototypeConnectNoteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  parentNoteId: string;
  anchorRect?: DOMRect | null;
  /** When provided, the connection is created as an anchored study-thread highlight (linkedNote kind). */
  anchorInfo?: ConnectNoteAnchorInfo;
  /** Called on success when anchorInfo is provided — passes back the study thread ID so the caller can apply a TipTap mark. */
  onConnectedWithThread?: (studyThreadId: string, linkedNoteId: string, linkedNoteTitle: string) => void;
  /** Optional loaded space notes — enables Unsorted / All notes scope toggle. */
  spaceNotes?: SpaceNoteRow[];
  /** Already-connected note ids (excluded from the picker alongside parentNoteId). */
  connectedNoteIds?: string[];
}

function normalizedSpacePathId(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

export default function PrototypeConnectNoteSheet({
  open,
  onOpenChange,
  spaceId,
  parentNoteId,
  anchorRect = null,
  anchorInfo,
  onConnectedWithThread,
  spaceNotes = [],
  connectedNoteIds = [],
}: PrototypeConnectNoteSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const queryClient = useQueryClient();
  const connectMutation = useConnectNote();
  const createHighlightMutation = useCreateHighlight();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const anchorRectRef = useRef(anchorRect);
  anchorRectRef.current = anchorRect;
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedNote, setSelectedNote] = useState<AddNotesCandidate | null>(null);

  const sidPath = normalizedSpacePathId(spaceId);
  const isPending = connectMutation.isPending || createHighlightMutation.isPending;
  const canSubmit = selectedIds.length === 1 && !isPending;
  const excludeNoteIds = useMemo(
    () => [...new Set([parentNoteId, ...connectedNoteIds])],
    [parentNoteId, connectedNoteIds],
  );

  useEffect(() => {
    if (!open) {
      setConnectError(null);
      setSelectedIds([]);
      setSelectedNote(null);
    }
  }, [open]);

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const handleConnect = () => {
    const linkedNoteId = selectedIds[0];
    if (!linkedNoteId) return;
    const linkedNoteTitle = selectedNote?.title ?? '';
    setConnectError(null);
    if (anchorInfo) {
      createHighlightMutation.mutate(
        {
          parentNoteId,
          spaceId,
          entryKind: 'linkedNote',
          highlightAccentRaw: 'violet',
          linkedNoteId,
          linkedNoteTitle,
          sourceSnippet: anchorInfo.sourceSnippet,
          anchorLocation: anchorInfo.anchorLocation,
          anchorLength: anchorInfo.anchorLength,
          anchorTextSnapshot: anchorInfo.anchorTextSnapshot,
        },
        {
          onSuccess: (data) => {
            const threadId = data?.studyThread?.id;
            if (threadId) {
              onConnectedWithThread?.(threadId, linkedNoteId, linkedNoteTitle);
            }
            queryClient.invalidateQueries({ queryKey: ['note', linkedNoteId] });
            queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sidPath, 'study-threads'] });
            queryClient.invalidateQueries({ queryKey: ['space', sidPath, 'notes'] });
            queryClient.invalidateQueries({ queryKey: ['space', sidPath, 'bootstrap'] });
            queryClient.invalidateQueries({ queryKey: ['connectNoteCandidates'] });
            queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
            try {
              window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: parentNoteId } }));
              window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: linkedNoteId } }));
            } catch {
              /* ignore */
            }
            onOpenChange(false);
            try {
              window.toast?.success('Note connected');
            } catch {
              /* ignore */
            }
          },
          onError: (err) => {
            const msg = err instanceof Error ? err.message : 'Could not connect that note.';
            setConnectError(msg);
          },
        },
      );
    } else {
      connectMutation.mutate(
        { parentNoteId, linkedNoteId, spaceId },
        {
          onSuccess: (data) => {
            onOpenChange(false);
            try {
              if (data?.alreadyLinked) {
                window.toast?.info('Already connected');
              } else {
                window.toast?.success('Note connected');
              }
            } catch {
              /* ignore */
            }
          },
          onError: (err) => {
            const msg = err instanceof Error ? err.message : 'Could not connect that note.';
            setConnectError(msg);
          },
        },
      );
    }
  };

  const shouldUsePopover = open && !shouldUseSheetPresentation;

  const syncPopoverPosition = () => {
    const card = cardRef.current;
    if (!card) return;
    setPosition(computeAnchoredPopoverPosition(card, anchorRectRef.current));
  };

  useLayoutEffect(() => {
    if (!shouldUsePopover) {
      setPosition(null);
      return;
    }
    syncPopoverPosition();
  }, [shouldUsePopover, anchorRect, selectedIds.length, connectError]);

  useEffect(() => {
    if (!shouldUsePopover) return undefined;
    const card = cardRef.current;
    if (!card) return undefined;
    const ro = new ResizeObserver(() => syncPopoverPosition());
    ro.observe(card);
    const onResize = () => syncPopoverPosition();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [shouldUsePopover, open]);

  useDismissOnOutside(cardRef, () => onOpenChange(false), shouldUsePopover);

  if (!open) return null;

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">Connect note</span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <PrototypeAddNotesPicker
        key={open ? 'open' : 'closed'}
        spaceId={spaceId}
        spaceNotes={spaceNotes}
        excludeNoteIds={excludeNoteIds}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onSelectedNoteChange={setSelectedNote}
        selectionMode="single"
        listShell="scoped"
        showListScopeToggle={spaceNotes.length > 0}
        isPending={isPending}
      />

      {connectError ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {connectError}
        </p>
      ) : null}

      <div className="proto-add-notes-sheet__footer">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!canSubmit}
          onClick={() => handleConnect()}
        >
          {isPending ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </>
  );

  if (shouldUsePopover && typeof document !== 'undefined') {
    return createPortal(
      <ProtoPopoverShell
        ref={cardRef}
        role="dialog"
        aria-label="Connect note"
        className="proto-connect-note-popover"
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          zIndex: 6000,
        }}
      >
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-add-notes-sheet">{content}</div>
      </ProtoPopoverShell>,
      document.body,
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-add-notes-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
