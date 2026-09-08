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
      if (e.key !== 'Escape') return;
      /* See the note on the capture phase in `useDismissOnOutside` below — same bargain. */
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return { open, setOpen, close, toggle, rootRef };
}

/**
 * Outside-dismiss behavior for a *controlled, portaled* popover — one the parent
 * mounts/unmounts (the parent owns "open"). Wires the shared listeners:
 *   - a capture-phase `pointerdown` outside `ref` invokes `onDismiss`
 *   - pressing `Escape` invokes `onDismiss`
 *
 * Matches the effect previously copy-pasted across the portaled popovers
 * (`PrototypeFolderPopover`, `PrototypeSharePopover`, `PrototypeStudyThreadPopover`,
 * `PrototypeConnectNoteSheet`). `onDismiss` is held in a ref so passing an inline
 * closure doesn't re-subscribe the listeners on every render. Pass `enabled = false`
 * to keep the component mounted without active listeners (e.g. non-popover layouts).
 *
 * Use this for portaled popovers (where the floating content is NOT a DOM child of
 * the trigger); use `usePopoverDismiss` for inline menus that own their open state.
 */
export type DismissOnOutsideOptions = {
  /** Clicks inside matching elements do not dismiss (e.g. sidebar while switching notes). */
  ignoreSelector?: string;
  /** Defaults to true. Modal focus scopes can own Escape without double-dismissal. */
  dismissOnEscape?: boolean;
};

export function useDismissOnOutside<T extends HTMLElement = HTMLElement>(
  ref: { current: T | null },
  onDismiss: () => void,
  enabled = true,
  options?: DismissOnOutsideOptions,
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const ignoreSelector = options?.ignoreSelector;
  const dismissOnEscape = options?.dismissOnEscape ?? true;

  useEffect(() => {
    if (!enabled) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      const target = e.target as Node | null;
      if (!el || !target || el.contains(target)) return;
      if (ignoreSelector && target instanceof Element && target.closest(ignoreSelector)) return;
      onDismissRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!dismissOnEscape || e.key !== 'Escape') return;
      /*
       * Claim the key, so whatever this overlay sits on top of does not also close.
       *
       * Surfaces that close on Escape check `defaultPrevented` first — the search panel says
       * so in as many words, "the search field, inner menus and confirm dialogs consume
       * Escape first" — but nothing here was consuming it, so one press dismissed the sheet
       * *and* the panel behind it, losing your place along with the dialog you meant to back
       * out of.
       *
       * Marking it is only half the fix: those surfaces listen on `document`, and in the
       * bubble phase `document` fires before `window`, so a mark set here would arrive after
       * they had already acted. Hence capture, which runs window-first — the overlay in
       * front gets to answer for the key before the thing behind it does.
       */
      e.preventDefault();
      onDismissRef.current();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions);
    };
  }, [ref, enabled, ignoreSelector, dismissOnEscape]);
}
