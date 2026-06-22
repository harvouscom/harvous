import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DeleteConfirmBar from '@/components/react/DeleteConfirmBar';
import ProtoPopoverShell from './ProtoPopoverShell';
import { computeAnchoredPopoverPosition } from './proto-popover-position';

const CARD_MIN_WIDTH = 200;
const CARD_MAX_WIDTH = 320;
const CARD_MIN_HEIGHT = 44;
const Z_INDEX = 6000;

export type ProtoConfirmDialogProps = {
  /** Trigger element rect — from `getBoundingClientRect()` on the delete control. */
  anchorRect: DOMRect;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Anchored destructive confirmation — single-row delete bar parity for prototype.
 * Portaled near the trigger; Escape and outside click cancel.
 */
export default function ProtoConfirmDialog({
  anchorRect,
  title,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep',
  busy = false,
  onConfirm,
  onCancel,
}: ProtoConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(computeAnchoredPopoverPosition(anchorRect, width || CARD_MIN_WIDTH, height || CARD_MIN_HEIGHT));
  }, [anchorRect]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!cardRef.current) return;
      const target = e.target as Node | null;
      if (target && !cardRef.current.contains(target)) {
        if (!busy) onCancel();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [busy, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <ProtoPopoverShell
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-label={title || 'Confirm delete'}
      className="harvous-delete-confirm floating-picker-enter"
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
        title={title}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        busy={busy}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </ProtoPopoverShell>,
    document.body,
  );
}
