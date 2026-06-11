/**
 * Floating folder editor popover anchored under the toolbar folder chip.
 * Same anchor/position pattern as PrototypeSharePopover.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NoteDetail } from '../../hooks/queries/useNote';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import PrototypeFolderTagEditor from './PrototypeFolderTagEditor';
import ProtoPopoverShell from './ProtoPopoverShell';
import { PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';

const CARD_WIDTH = 340;
const VIEWPORT_MARGIN = 12;
const CARD_OFFSET = PROTO_TOOLBAR_POPOVER_OFFSET;

interface PrototypeFolderPopoverProps {
  note: NoteDetail;
  anchorRect: DOMRect | null;
  onDismiss: () => void;
}

function computePosition(anchor: DOMRect, cardHeight: number): { top: number; left: number } {
  if (typeof window === 'undefined') return { top: 0, left: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = anchor.bottom + CARD_OFFSET;
  if (top + cardHeight + VIEWPORT_MARGIN > vh) {
    top = anchor.top - cardHeight - CARD_OFFSET;
  }
  if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

  let left = anchor.left + anchor.width / 2 - CARD_WIDTH / 2;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + CARD_WIDTH + VIEWPORT_MARGIN > vw) {
    left = vw - CARD_WIDTH - VIEWPORT_MARGIN;
  }
  return { top, left };
}

export default function PrototypeFolderPopover({
  note,
  anchorRect,
  onDismiss,
}: PrototypeFolderPopoverProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const h = cardRef.current?.getBoundingClientRect().height ?? 320;
    setPos(computePosition(anchorRect, h));
  }, [anchorRect]);

  useDismissOnOutside(cardRef, onDismiss);

  if (!anchorRect || typeof document === 'undefined') return null;

  return createPortal(
    <ProtoPopoverShell
      ref={cardRef}
      role="dialog"
      aria-label="Edit folder"
      className="proto-folder-popover"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: CARD_WIDTH,
        zIndex: 6000,
      }}
    >
      <PrototypeFolderTagEditor note={note} folderOnly />
    </ProtoPopoverShell>,
    document.body,
  );
}
