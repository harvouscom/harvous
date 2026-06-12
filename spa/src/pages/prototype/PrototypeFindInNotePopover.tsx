import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { protoPortaledPopoverClassName } from './proto-portaled-popover-classes';
import { PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';

const CARD_WIDTH = 320;
const CARD_OFFSET = PROTO_TOOLBAR_POPOVER_OFFSET;

interface PrototypeFindInNotePopoverProps {
  noteId: string;
  anchorRect: DOMRect | null;
  onDismiss: () => void;
  exiting?: boolean;
}

/** In-note find popover — dispatches to TipTap via `prototypeFindInNote`. */
export default function PrototypeFindInNotePopover({
  noteId,
  anchorRect,
  onDismiss,
  exiting = false,
}: PrototypeFindInNotePopoverProps) {
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<ReturnType<typeof computeRightAnchoredPopoverPosition> | null>(null);

  const runFind = useCallback(
    (direction: 'next' | 'prev' | 'same' = 'same') => {
      const q = query.trim();
      if (!q) return;
      let idx = matchIndex;
      if (direction === 'next' && matchCount > 0) idx = (matchIndex + 1) % matchCount;
      if (direction === 'prev' && matchCount > 0) idx = (matchIndex - 1 + matchCount) % matchCount;
      window.dispatchEvent(
        new CustomEvent('prototypeFindInNote', {
          detail: { noteId, query: q, matchIndex: idx },
        }),
      );
    },
    [noteId, query, matchIndex, matchCount],
  );

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const h = cardRef.current?.getBoundingClientRect().height ?? 44;
    setPos(computeRightAnchoredPopoverPosition(anchorRect, CARD_WIDTH, h, CARD_OFFSET));
  }, [anchorRect, query, matchCount]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [anchorRect]);

  useEffect(() => {
    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || String(d.noteId) !== String(noteId)) return;
      setMatchCount(Number(d.count) || 0);
      setMatchIndex(Number(d.index) || 0);
    };
    window.addEventListener('prototypeFindInNoteResult', onResult as EventListener);
    return () => window.removeEventListener('prototypeFindInNoteResult', onResult as EventListener);
  }, [noteId]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!cardRef.current) return;
      const target = e.target as Node | null;
      if (target && !cardRef.current.contains(target)) {
        onDismiss();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onDismiss();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventInit);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);

  if (!anchorRect || typeof document === 'undefined') return null;

  return createPortal(
    <ProtoPopoverShell
      ref={cardRef}
      role="search"
      aria-label="Find in note"
      className={protoPortaledPopoverClassName('proto-find-popover', {
        exiting,
        placement: pos?.placement,
        originAlign: 'right',
      })}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: CARD_WIDTH,
        zIndex: 6000,
      }}
    >
      <input
        ref={inputRef}
        type="search"
        className="proto-find-popover__input"
        placeholder="Find in note"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setMatchIndex(0);
          setMatchCount(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            runFind(e.shiftKey ? 'prev' : 'next');
          }
        }}
        aria-label="Find in note"
      />
      <span className="proto-find-popover__count" aria-hidden={!query.trim() && matchCount === 0}>
        {matchCount > 0 ? `${matchIndex + 1} / ${matchCount}` : query.trim() ? '0' : ''}
      </span>
      <button
        type="button"
        className="proto-find-popover__btn"
        onClick={() => runFind('prev')}
        aria-label="Previous match"
      >
        <Icon name="chevron-up" size={12} aria-hidden />
      </button>
      <button
        type="button"
        className="proto-find-popover__btn"
        onClick={() => runFind('next')}
        aria-label="Next match"
      >
        <Icon name="chevron-down" size={12} aria-hidden />
      </button>
      <button type="button" className="proto-find-popover__btn" onClick={onDismiss} aria-label="Close find">
        <Icon name="xmark" size={12} aria-hidden />
      </button>
    </ProtoPopoverShell>,
    document.body,
  );
}
