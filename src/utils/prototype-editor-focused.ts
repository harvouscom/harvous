/**
 * True when the prototype note editor (title, body, or mobile keyboard proxy) holds focus.
 * Mirrors native `HarvousEditorSyncGuard` body/title protection for web sync paths.
 */
export function isPrototypeNoteEditorFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el.closest('.ProseMirror')) return true;
  if (el.tagName === 'TEXTAREA' && el.closest('[data-note-id]')) return true;
  const titleInput = el.closest('[data-card-full-editable] input[type="text"], [data-card-full-editable] textarea:not(.card-full-editable__keyboard-proxy)');
  if (titleInput && el.closest('[data-card-full-editable]')) return true;
  return false;
}
