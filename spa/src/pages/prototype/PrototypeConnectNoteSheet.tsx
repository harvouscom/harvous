import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { api } from '../../lib/api';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import ProtoPopoverShell from './ProtoPopoverShell';
import { useProtoShell } from '../../layouts/proto-shell-context';

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
  anchorRect?: DOMRect | null;
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
}: PrototypeConnectNoteSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { input: searchInput, setInput: setSearchInput, debounced, clear } = useDebouncedSearchState(280);
  const connectMutation = useConnectNote();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

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
  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

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

  const shouldUsePopover = open && !shouldUseSheetPresentation;

  useLayoutEffect(() => {
    if (!shouldUsePopover) return;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 360;
    const cardWidth = cardRef.current?.getBoundingClientRect().width ?? 340;
    const viewportMargin = 12;
    const offset = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeRect = activeEl?.getBoundingClientRect() ?? null;
    const effectiveAnchor = anchorRect ?? activeRect;

    let top: number;
    let left: number;
    if (effectiveAnchor) {
      top = effectiveAnchor.bottom + offset;
      if (top + cardHeight + viewportMargin > vh) {
        top = effectiveAnchor.top - cardHeight - offset;
      }
      if (top < viewportMargin) top = viewportMargin;

      left = effectiveAnchor.left;
      if (left + cardWidth + viewportMargin > vw) {
        left = vw - cardWidth - viewportMargin;
      }
      if (left < viewportMargin) left = viewportMargin;
    } else {
      left = Math.max(viewportMargin, (vw - cardWidth) / 2);
      top = Math.max(viewportMargin, Math.min(vh - cardHeight - viewportMargin, vh * 0.2));
    }

    setPosition({ top, left });
  }, [anchorRect, shouldUsePopover, notes.length, isLoading, isFetching]);

  useEffect(() => {
    if (!shouldUsePopover) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!cardRef.current) return;
      const target = e.target as Node | null;
      if (target && !cardRef.current.contains(target)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as AddEventListenerOptions);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shouldUsePopover, onOpenChange]);

  const content = (
    <>
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
              {stripServerAutoUntitledNoteTitleForDisplay((n.title ?? '').trim()) || 'New Note'}
            </span>
          </button>
        ))}
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
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover">{content}</div>
      </ProtoPopoverShell>,
      document.body,
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
