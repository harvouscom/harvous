import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeAnchoredPopoverPosition } from '@/utils/anchored-popover-position';
import DeleteConfirmBar from './DeleteConfirmBar';

const CARD_MIN_WIDTH = 200;
const CARD_MAX_WIDTH = 320;
const CARD_MIN_HEIGHT = 44;
const Z_INDEX = 99999;

export type ScripturePillDeleteConfirmProps = {
  anchorRect: DOMRect;
  onConfirm: () => void;
  onDismiss: () => void;
  /** When provided, an Edit action re-opens the pill for inline editing. */
  onEdit?: () => void;
};

/** Portaled scripture-pill edit/delete bar — anchored below the pill. */
export default function ScripturePillDeleteConfirm({
  anchorRect,
  onConfirm,
  onDismiss,
  onEdit,
}: ScripturePillDeleteConfirmProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(computeAnchoredPopoverPosition(anchorRect, width || CARD_MIN_WIDTH, height || CARD_MIN_HEIGHT));
  }, [anchorRect]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={cardRef}
      data-harvous-bottom-sheet-floating=""
      role="dialog"
      aria-modal="false"
      aria-label="Scripture pill actions"
      className="harvous-delete-confirm scripture-delete-confirm floating-picker-enter"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        minWidth: CARD_MIN_WIDTH,
        maxWidth: CARD_MAX_WIDTH,
        zIndex: Z_INDEX,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <DeleteConfirmBar
        confirmLabel="Remove"
        cancelLabel="Keep"
        editLabel="Edit"
        onEdit={onEdit}
        onConfirm={onConfirm}
        onCancel={onDismiss}
      />
    </div>,
    document.body,
  );
}
