/** Thin wrappers around `public/scripts/session-tracker.js` globals (SPA prototype). */

type SessionTrackerWindow = Window & {
  trackNoteOpen?: (noteId: string) => void;
  trackNoteEdit?: (noteId: string) => void;
  trackContentCreated?: (itemId: string) => void;
};

function win(): SessionTrackerWindow {
  return window as SessionTrackerWindow;
}

export function trackSessionNoteOpen(noteId: string): void {
  win().trackNoteOpen?.(noteId);
}

export function trackSessionNoteEdit(noteId: string): void {
  win().trackNoteEdit?.(noteId);
}

export function trackSessionContentCreated(itemId: string): void {
  win().trackContentCreated?.(itemId);
}
