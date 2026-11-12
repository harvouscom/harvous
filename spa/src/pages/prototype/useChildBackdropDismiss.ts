import { useEffect } from 'react';

function outside(dialog: HTMLDialogElement, event: MouseEvent) {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}
function backdropOf(event: MouseEvent) {
  const target = event.target;
  return target instanceof HTMLDialogElement && target.open && outside(target, event) ? target : null;
}

/**
 * In child mode, a tap on the dimmed area around any modal closes it, the same as Escape: the
 * dialog gets a cancelable `cancel` first, so a modal that is busy saving (or wants to save before
 * it goes) still decides, and only then `close()`. One listener for every `<dialog>` the child
 * notebook opens, so a new modal gets it for free. The press has to start on the backdrop too, so
 * dragging a text selection out of a field doesn't close the modal.
 */
export function useChildBackdropDismiss() {
  useEffect(() => {
    let pressed: HTMLDialogElement | null = null;
    const down = (event: PointerEvent) => { pressed = backdropOf(event); };
    const click = (event: MouseEvent) => {
      const dialog = backdropOf(event);
      const started = pressed;
      pressed = null;
      if (!dialog || dialog !== started) return;
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click);
    };
  }, []);
}
