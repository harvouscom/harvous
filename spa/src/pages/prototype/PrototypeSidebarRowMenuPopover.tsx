/**
 * Portaled sidebar row ⋯ menu — escapes the scroll stacking context so only the
 * menu paints above the daily-passage floating stack, not the whole note list.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import ProtoPopoverShell from './ProtoPopoverShell';

const MENU_GAP = 2;
/** Above `.proto-sidebar-floating-stack` (2); below toolbar / modal popovers. */
const MENU_Z_INDEX = 100;

type MenuPosition = { top: number; right: number; maxWidth: number };

function measureMenuPosition(rowEl: HTMLElement): MenuPosition {
  const rowRect = rowEl.getBoundingClientRect();
  return {
    top: rowRect.bottom + MENU_GAP,
    right: Math.max(0, window.innerWidth - rowRect.right),
    maxWidth: rowRect.width,
  };
}

export interface PrototypeSidebarRowMenuPopoverProps {
  open: boolean;
  rowRef: RefObject<HTMLElement | null>;
  triggerRootRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  'aria-label': string;
  children: ReactNode;
}

export default function PrototypeSidebarRowMenuPopover({
  open,
  rowRef,
  triggerRootRef,
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
      setPos(measureMenuPosition(rowRef.current));
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, rowRef]);

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
