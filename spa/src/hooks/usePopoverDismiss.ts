import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Open/close state for a prototype popover or dropdown menu, bundled with the
 * standard dismiss behavior shared across the toolbar/sidebar menus:
 *   - a `mousedown` outside the container closes it
 *   - pressing `Escape` closes it
 *
 * Pairs with the visual-only `ProtoPopoverShell`. Attach `rootRef` to the element
 * that wraps BOTH the trigger and the popover, so clicking the trigger is not
 * treated as an "outside" click.
 *
 * Replaces the open/ref/useEffect block that was copy-pasted across
 * `ListViewMenu`, `PrototypeNoteMoreMenu`, `AccountMenu`, and friends.
 */
export function usePopoverDismiss<T extends HTMLElement = HTMLDivElement>(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);
  const rootRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return { open, setOpen, close, toggle, rootRef };
}
