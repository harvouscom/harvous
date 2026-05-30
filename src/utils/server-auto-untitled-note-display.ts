/**
 * `POST /api/notes/create` uses `getNextUntitledNoteName` when the title is empty, producing values like
 * "Untitled Note 1". Native Harvous shows an empty title with placeholder "Title" instead — treat these
 * as blank for display in prototype / native-chrome web surfaces.
 */
const SERVER_AUTO_UNTITLED_NOTE = /^\s*Untitled Note(?: \d+)?\s*$/i;

export function isServerAutoUntitledNoteTitle(title: string | null | undefined): boolean {
  if (title == null) return false;
  const t = title.trim();
  return t.length > 0 && SERVER_AUTO_UNTITLED_NOTE.test(t);
}

/** Returns `''` when `title` is only the server-assigned untitled pattern; otherwise returns `title` unchanged. */
export function stripServerAutoUntitledNoteTitleForDisplay(title: string | null | undefined): string {
  if (title == null) return '';
  const t = title.trim();
  if (t === '') return '';
  return SERVER_AUTO_UNTITLED_NOTE.test(t) ? '' : title;
}
