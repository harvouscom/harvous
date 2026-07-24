import { useLayoutEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const openDialogStack: HTMLElement[] = [];

function isTopDialog(dialog: HTMLElement): boolean {
  return openDialogStack[openDialogStack.length - 1] === dialog;
}

function isAvailable(element: HTMLElement): boolean {
  if (element.hidden || element.closest('[hidden], [aria-hidden="true"]')) return false;
  if ('disabled' in element && element.disabled === true) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isAvailable);
}

function focusInitialElement(dialog: HTMLElement, initialFocusRef?: RefObject<HTMLElement | null>) {
  const requested = initialFocusRef?.current;
  const initialMarker = Array.from(
    dialog.querySelectorAll<HTMLElement>('[data-proto-dialog-initial-focus]'),
  ).find(isAvailable);
  const heading = Array.from(
    dialog.querySelectorAll<HTMLElement>('[data-proto-dialog-heading]'),
  ).find(isAvailable);
  const target =
    (requested && dialog.contains(requested) && isAvailable(requested) ? requested : null) ??
    initialMarker ??
    heading ??
    focusableElements(dialog)[0] ??
    dialog;
  target.focus({ preventScroll: true });
}

export interface UseProtoDialogFocusOptions {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Set false for an anchored state change that should receive focus without becoming modal. */
  trapFocus?: boolean;
  /** Defaults to true. Nested dialogs restore to the control that opened them. */
  restoreFocus?: boolean;
}

/**
 * Focus contract for prototype portaled dialogs.
 *
 * Vaul drawers already provide their own focus scope and must not use this hook.
 * Portaled desktop dialogs use it to focus synchronously, trap Tab, dismiss on
 * Escape, and restore the trigger. A small stack keeps nested confirmations from
 * competing with their parent dialog even though both are portaled to `body`.
 */
export function useProtoDialogFocus({
  open,
  dialogRef,
  onDismiss,
  initialFocusRef,
  trapFocus = true,
  restoreFocus = true,
}: UseProtoDialogFocusOptions) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const addedFallbackTabIndex = !dialog.hasAttribute('tabindex');
    if (addedFallbackTabIndex) dialog.tabIndex = -1;

    const previousIndex = openDialogStack.indexOf(dialog);
    if (previousIndex >= 0) openDialogStack.splice(previousIndex, 1);
    openDialogStack.push(dialog);
    focusInitialElement(dialog, initialFocusRef);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialog)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onDismissRef.current();
        return;
      }
      if (!trapFocus || event.key !== 'Tab') return;

      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (!(active instanceof HTMLElement) || !focusable.includes(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = openDialogStack.lastIndexOf(dialog);
      if (index >= 0) openDialogStack.splice(index, 1);
      if (addedFallbackTabIndex) dialog.removeAttribute('tabindex');
      if (restoreFocus && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [dialogRef, initialFocusRef, open, restoreFocus, trapFocus]);
}
