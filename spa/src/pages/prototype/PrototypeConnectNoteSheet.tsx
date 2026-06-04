import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { api } from '../../lib/api';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import { useCreateHighlight } from '../../hooks/mutations/useCreateHighlight';
import { navigationQueryKeyPrefix } from '../../hooks/queries/useNavigation';
import Icon from '@/components/react/Icon';
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
}: PrototypeConnectNoteSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { input: searchInput, setInput: setSearchInput, debounced, clear } = useDebouncedSearchState(280);
  const queryClient = useQueryClient();
  const connectMutation = useConnectNote();
  const createHighlightMutation = useCreateHighlight();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const sidPath = normalizedSpacePathId(spaceId);
  const debouncedTrim = debounced.trim();

  useEffect(() => {
    if (!open) {
      clear();
      setConnectError(null);
    }
  }, [open, clear]);

  // Fetch candidates: always-on (empty q = recent notes), or filtered by search query.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['connectNoteCandidates', sidPath, parentNoteId, debouncedTrim] as const,
    queryFn: () =>
      api.get<ConnectNoteCandidatesResponse>(
        `/api/spaces/${encodeURIComponent(sidPath)}/connect-note-candidates`,
        { q: debouncedTrim, excludeNoteId: parentNoteId, limit: 15 },
      ),
    enabled: open,
    staleTime: 10_000,
  });

  const notes = data?.notes ?? [];
  const isSearching = debouncedTrim.length >= 1 && (isLoading || isFetching) && notes.length === 0;
  const showEmpty = debouncedTrim.length >= 1 && !isLoading && !isFetching && notes.length === 0;
  const showRecent = debouncedTrim.length === 0;

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const handlePick = (linkedNoteId: string, linkedNoteTitle: string) => {
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
            // Invalidate the same queries useConnectNote does so sidebar/inspector update
            const sid = sidPath;
            queryClient.invalidateQueries({ queryKey: ['note', linkedNoteId] });
            queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sid, 'study-threads'] });
            queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
            queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
            queryClient.invalidateQueries({ queryKey: ['connectNoteCandidates'] });
            queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
            try {
              window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: parentNoteId } }));
              window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: linkedNoteId } }));
            } catch { /* ignore */ }
            onOpenChange(false);
            try { window.toast?.success('Note connected'); } catch { /* ignore */ }
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
          onSuccess: () => {
            onOpenChange(false);
            try { window.toast?.success('Note connected'); } catch { /* ignore */ }
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

  useLayoutEffect(() => {
    if (!shouldUsePopover) return;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 400;
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
      if (top + cardHeight + viewportMargin > vh) top = effectiveAnchor.top - cardHeight - offset;
      if (top < viewportMargin) top = viewportMargin;
      left = effectiveAnchor.left;
      if (left + cardWidth + viewportMargin > vw) left = vw - cardWidth - viewportMargin;
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
      if (target && !cardRef.current.contains(target)) onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as AddEventListenerOptions);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shouldUsePopover, onOpenChange]);

  const content = (
    <>
      {/* Header — matches threads popover minimal header */}
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="arrow-right-arrow-left" size={12} aria-hidden />
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

      <div className="proto-connect-note-sheet__search-wrap">
        <PrototypeSearchInput
          value={searchInput}
          onChange={(v) => { setSearchInput(v); setConnectError(null); }}
          placeholder="Search notes…"
          autoFocus={open}
        />
      </div>

      {connectError ? (
        <p className="proto-connect-note-sheet__error" role="alert">{connectError}</p>
      ) : null}

      <div className="proto-connect-note-sheet__scroll" role="region" aria-label="Notes to connect">
        {isLoading && notes.length === 0 ? (
          <p className="proto-inspector-muted" style={{ padding: '8px 14px' }}>Loading…</p>
        ) : isSearching ? (
          <p className="proto-inspector-muted" style={{ padding: '8px 14px' }}>Searching…</p>
        ) : showEmpty ? (
          <p className="proto-inspector-muted" style={{ padding: '8px 14px' }}>No notes match "{debouncedTrim}".</p>
        ) : (
          <section className="proto-inspector-section">
            {showRecent && notes.length > 0 ? (
              <p className="proto-inspector-section-title">Recent</p>
            ) : null}
            <ul className="proto-side-panel__note-list">
              {notes.map((n) => {
                const title = stripServerAutoUntitledNoteTitleForDisplay((n.title ?? '').trim()) || 'New Note';
                return (
                  <li key={n.id} className="proto-note-row-item">
                    <button
                      type="button"
                      disabled={connectMutation.isPending || createHighlightMutation.isPending}
                      className="proto-note-row__main"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handlePick(n.id, n.title)}
                    >
                      <div className="proto-note-row__title-line">
                        <span className="pds-list-title proto-note-row__title-text">{title}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
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
