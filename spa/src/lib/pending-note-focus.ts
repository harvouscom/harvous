/**
 * Bridge "I just created this note, put me in it" across the navigation that
 * follows the create.
 *
 * The editor mounts asynchronously after the router lands on `/{id}`, so the
 * creating component can't focus it directly. Same shape as
 * `pending-compose-session.ts`, which solves the equivalent problem for
 * `/n/new` → `/`; keyed by note id here so a stale flag can never pull focus
 * into an unrelated note.
 */
const PENDING_NOTE_FOCUS_KEY = 'harvous_pending_note_focus';

export function markPendingNoteFocus(noteId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!noteId) return;
  sessionStorage.setItem(PENDING_NOTE_FOCUS_KEY, noteId);
}

/** True exactly once, and only for the note the flag was set for. */
export function consumePendingNoteFocus(noteId: string | null | undefined): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  if (!noteId) return false;
  if (sessionStorage.getItem(PENDING_NOTE_FOCUS_KEY) !== noteId) return false;
  sessionStorage.removeItem(PENDING_NOTE_FOCUS_KEY);
  return true;
}
