/**
 * Portaled sidebar row ⋯ menu — escapes the scroll stacking context so only the
 * menu paints above the daily-passage floating stack, not the whole note list.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import ProtoPopoverShell from './ProtoPopoverShell';

export const MENU_GAP = 2;
/** Above sidebar scroll content (1); below toolbar / modal popovers. */
const MENU_Z_INDEX = 100;

type MenuPosition = { top: number; right: number; maxWidth: number };

/**
 * The menu's slot: just below the row, right-aligned to it. Exported as a pure function
 * so the delete confirm — which takes this slot over when the menu closes — can be
 * checked against the same rule instead of restating it.
 */
/**
 * Where the menu hangs, measured from whatever it is anchored to.
 *
 * `maxWidth` follows the anchor because the usual anchor is a **list row** and a menu wider
 * than its row reads as belonging to the panel rather than to that line. That breaks when
 * the anchor is a bare icon button: capping the menu at a 28px trigger would make it
 * unreadable, so `minWidth` puts a floor under it. Callers anchoring to a row leave it
 * alone; the row is always wider than the floor.
 */
export function measureMenuPositionFromRect(
  rowRect: DOMRect,
  viewportWidth: number,
  options?: { minWidth?: number },
): MenuPosition {
  return {
    top: rowRect.bottom + MENU_GAP,
    right: Math.max(0, viewportWidth - rowRect.right),
    maxWidth: Math.max(rowRect.width, options?.minWidth ?? 0),
  };
}

/**
 * Enough for the longest label a menu here carries ("Turn off study plan") without wrapping.
 * Only ever reached when the anchor is smaller than this — a row anchor keeps its own width.
 */
export const TRIGGER_ANCHOR_MIN_WIDTH = 210;

function measureMenuPosition(rowEl: HTMLElement, minWidth?: number): MenuPosition {
  return measureMenuPositionFromRect(rowEl.getBoundingClientRect(), window.innerWidth, {
    minWidth,
  });
}

export interface PrototypeSidebarRowMenuPopoverProps {
  open: boolean;
  /**
   * What the menu hangs from. Normally the list row, so the menu lines up with the line it
   * acts on. Pass the trigger's own wrapper when there is no row — a header block is not a
   * row, and anchoring to one drops the menu under the whole block instead of under the
   * button that opened it.
   */
  rowRef: RefObject<HTMLElement | null>;
  triggerRootRef: RefObject<HTMLElement | null>;
  /** Floor for the menu's width, for anchors narrower than their own menu. */
  minWidth?: number;
  onDismiss: () => void;
  'aria-label': string;
  children: ReactNode;
}

export default function PrototypeSidebarRowMenuPopover({
  open,
  rowRef,
  triggerRootRef,
  minWidth,
  onDismiss,
  'aria-label': ariaLabel,
  children,
}: PrototypeSidebarRowMenuPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const rowEl = rowRef.current;
    if (!rowEl) return undefined;

    const update = () => {
      if (!rowRef.current) return;
      setPos(measureMenuPosition(rowRef.current, minWidth));
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, rowRef, minWidth]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onDismiss, triggerRootRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <ProtoPopoverShell
      ref={popoverRef}
      role="menu"
      aria-label={ariaLabel}
      className="proto-menu__popover proto-menu__popover--right proto-menu__popover--list-view proto-menu__popover--note-row proto-menu__popover--note-row-portal"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        right: pos?.right ?? 0,
        maxWidth: pos?.maxWidth,
        zIndex: MENU_Z_INDEX,
      }}
    >
      {children}
    </ProtoPopoverShell>,
    document.body,
  );
}
