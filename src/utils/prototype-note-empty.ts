import { canonicalizeNoteHtmlLineBreaks, stripHrAdjacentEmptyParagraphs } from './note-html-linebreaks';
import { stripServerAutoUntitledNoteTitleForDisplay } from './server-auto-untitled-note-display';

/** Native parity: empty TipTap/HTML body (including `<p></p>`). */
export function isTiptapBodyEmpty(html: string | undefined | null): boolean {
  if (html == null || html === '') return true;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.length === 0;
}

/** ProseMirror doc has no user-visible text (e.g. lone `<p><br></p>`). */
export function isDocTextEmpty(doc: { textContent: string }): boolean {
  return doc.textContent.trim().length === 0;
}

/** Caret position at the start of the first block for empty documents. */
export function preferredCaretPosForEmptyDoc(_doc?: { textContent: string }): number {
  return 1;
}

/**
 * Hydrate the editor with a true empty paragraph. Avoids lone `<p><br></p>` on load,
 * which places the caret on visual line 2. Save path still uses canonicalizeNoteHtmlLineBreaks.
 */
export function normalizeEmptyBodyHtmlForEditor(html: string | null | undefined): string {
  if (isTiptapBodyEmpty(html)) return '<p></p>';
  const withoutHrPadding = stripHrAdjacentEmptyParagraphs(html);
  return canonicalizeNoteHtmlLineBreaks(withoutHrPadding);
}

/** True when the note has no user-visible title and no body text (server "Untitled Note N" counts as empty). */
export function isEffectivelyEmptyPrototypeNote(
  title: string | null | undefined,
  content: string | null | undefined,
): boolean {
  const t = stripServerAutoUntitledNoteTitleForDisplay(title ?? '').trim();
  if (t.length > 0) return false;
  return isTiptapBodyEmpty(content);
}
