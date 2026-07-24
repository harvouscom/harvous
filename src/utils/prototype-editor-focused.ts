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

/** Inspector shells (portaled outside `.proto-note-pane-row`). */
const PROTO_INSPECTOR_FOCUS_SELECTOR =
  '.proto-inspector, .proto-inspector-desktop, .proto-inspector-mobile-panel';

/** True when `node` is inside the note inspector chrome. */
export function isPrototypeInspectorNode(node: Node | null | undefined): boolean {
  if (!node || !(node instanceof Element)) return false;
  return Boolean(node.closest(PROTO_INSPECTOR_FOCUS_SELECTOR));
}

/**
 * True when focus is still in the note compose session: editor or inspector.
 * Used so draft URL adoption does not flush while saving a template (etc.).
 */
export function isPrototypeNoteSessionFocused(): boolean {
  if (isPrototypeNoteEditorFocused()) return true;
  if (typeof document === 'undefined') return false;
  return isPrototypeInspectorNode(document.activeElement);
}
