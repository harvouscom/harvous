/**
 * "Scan a page" is started from more than one place (a blank note, Import) and carried out by
 * one host the shell mounts. The photo travels by event, like `prototypeShortcutNewNote`, so
 * no entry point has to own the sheet.
 *
 * The file input is one element on the page, outside React (`openScanChooser`). It used to live
 * in each button, and every button that opens the chooser also changes when a scan starts (the
 * blank note's line, the shell's "waiting" card) — so the button unmounted under the open iOS
 * chooser and took its input with it, and the chosen photo arrived to nobody. Found in the iOS
 * Simulator, where the photo really goes through the chooser. A photo picked before the host has
 * mounted is held until it does.
 */
import { clearScanPending, markScanPending } from './scan-pending';

export const SCAN_TEXT_EVENT = 'prototypeScanText';

/**
 * Raised by the host when the reader creates the note from a scan started on a blank note.
 * The note page answers it by filling itself and calling `preventDefault()`; if nothing
 * answers (the note was left while the sheet was up), the host starts a new note instead.
 */
export const SCAN_FILL_NOTE_EVENT = 'prototypeScanFillNote';

/** Where the scan goes: the blank note it was started from, or a new one. */
export type ScanTarget = 'current-note' | 'new-note';

export type ScanRequest = { file: File; target: ScanTarget };

let pending: ScanRequest | null = null;
let hostListening = false;

export function startScanText(file: File, target: ScanTarget = 'new-note'): void {
  const request: ScanRequest = { file, target };
  if (!hostListening) {
    pending = request;
    return;
  }
  window.dispatchEvent(new CustomEvent<ScanRequest>(SCAN_TEXT_EVENT, { detail: request }));
}

/** For the host: subscribe, and take a photo that arrived before it did. */
export function listenForScanText(onRequest: (request: ScanRequest) => void): () => void {
  const handler = (event: Event) => onRequest((event as CustomEvent<ScanRequest>).detail);
  window.addEventListener(SCAN_TEXT_EVENT, handler);
  hostListening = true;
  if (pending) {
    const request = pending;
    pending = null;
    onRequest(request);
  }
  return () => {
    window.removeEventListener(SCAN_TEXT_EVENT, handler);
    hostListening = false;
  };
}

/** Ask the open blank note to take the scan. True when it did. */
export function fillCurrentNote(contentHtml: string): boolean {
  const event = new CustomEvent<{ contentHtml: string }>(SCAN_FILL_NOTE_EVENT, {
    detail: { contentHtml },
    cancelable: true,
  });
  return !window.dispatchEvent(event);
}

/** What the photo input accepts. Deliberately no `capture` — see ScanTextTrigger. */
export const SCAN_TEXT_ACCEPT = 'image/*';

let chooser: HTMLInputElement | null = null;
let chooserTarget: ScanTarget = 'new-note';
let chooserOnPicked: (() => void) | null = null;

/**
 * Open the photo chooser for a scan. Call it inside the tap — a browser opens a picker only in
 * response to one. The input is created once and kept on `document.body`, so nothing that
 * re-renders while the chooser is up can take it away.
 */
export function openScanChooser(target: ScanTarget, onPicked?: () => void): void {
  if (typeof document === 'undefined') return;
  if (!chooser) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SCAN_TEXT_ACCEPT;
    input.hidden = true;
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      // Cleared so the same photo can be chosen again after a cancelled scan.
      input.value = '';
      clearScanPending();
      if (!file) return;
      startScanText(file, chooserTarget);
      chooserOnPicked?.();
    });
    // Safari 16.4+ and Chrome 113+; iOS sends nothing when its camera is dismissed, which is
    // why scan-pending only offers to resume a chooser scan after a reload.
    input.addEventListener('cancel', () => clearScanPending());
    document.body.appendChild(input);
    chooser = input;
  }
  chooserTarget = target;
  chooserOnPicked = onPicked ?? null;
  markScanPending('picker');
  chooser.click();
}
