import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DeleteConfirmBar from '@/components/react/DeleteConfirmBar';
import ProtoPopoverShell from './ProtoPopoverShell';
import { computeMainColumnTopRightPopoverPosition } from './proto-anchored-popover-position';
import { computeAnchoredPopoverPosition } from './proto-popover-position';
import { resolveAnchorRect, type ProtoAnchoredPopoverStrategy } from './useProtoAnchoredPopoverPosition';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';

const CARD_MIN_WIDTH = 200;
const CARD_MAX_WIDTH = 320;
const CARD_MIN_HEIGHT = 44;
const Z_INDEX = 6000;

export type ProtoConfirmDialogProps = {
  /** `main-column-top-right` for fixed-slot flows; default `anchor` for trigger-anchored confirms. */
  placement?: ProtoAnchoredPopoverStrategy;
  /** Live trigger element — used when placement is `anchor`. */
  anchorEl?: HTMLElement | null;
  /** Static trigger rect fallback when no live element is available. */
  anchorRect?: DOMRect | null;
  /** When true, positions above the anchor instead of flipping below when space allows. */
  preferAbove?: boolean;
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
  placement = 'anchor',
  anchorEl = null,
  anchorRect = null,
  preferAbove = false,
  title,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep',
  busy = false,
  onConfirm,
  onCancel,
}: ProtoConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const anchorElRef = useRef(anchorEl);
  const anchorRectRef = useRef(anchorRect);
  anchorElRef.current = anchorEl;
  anchorRectRef.current = anchorRect;
  const isFixedMainColumn = placement === 'main-column-top-right';
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const sync = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    if (isFixedMainColumn) {
      setPos(computeMainColumnTopRightPopoverPosition(el));
      return;
    }
    const anchor = resolveAnchorRect(anchorElRef.current, anchorRectRef.current);
    if (!anchor) return;
    const { width, height } = el.getBoundingClientRect();
    const cardWidth = width || CARD_MIN_WIDTH;
    const cardHeight = height || CARD_MIN_HEIGHT;
    const positioned = computeAnchoredPopoverPosition(anchor, cardWidth, cardHeight);
    if (preferAbove) {
      const offset = 7;
      const viewportMargin = 12;
      setPos({
        top: Math.max(viewportMargin, anchor.top - cardHeight - offset),
        left: positioned.left,
      });
      return;
    }
    setPos(positioned);
  }, [isFixedMainColumn, preferAbove]);

  useLayoutEffect(() => {
    sync();
  }, [sync, anchorEl, anchorRect, placement, preferAbove]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    const onResize = () => sync();
    window.addEventListener('resize', onResize);
    if (isFixedMainColumn) {
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', onResize);
      };
    }
    const onScroll = () => sync();
    window.addEventListener('scroll', onScroll, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isFixedMainColumn, sync]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!cardRef.current) return;
      const target = e.target as Node | null;
      if (target && !cardRef.current.contains(target)) {
        if (!busy) onCancel();
      }
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [busy, onCancel]);

  useProtoDialogFocus({
    open: true,
    dialogRef: cardRef,
    onDismiss: () => {
      if (!busy) onCancel();
    },
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <ProtoPopoverShell
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Confirm delete'}
      className="harvous-delete-confirm floating-picker-enter"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        maxWidth: CARD_MAX_WIDTH,
        zIndex: Z_INDEX,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <DeleteConfirmBar
        title={title}
        titleId={titleId}
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
