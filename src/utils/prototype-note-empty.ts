import { stripServerAutoUntitledNoteTitleForDisplay } from './server-auto-untitled-note-display';

/** Native parity: empty TipTap/HTML body (including `<p></p>`). */
export function isTiptapBodyEmpty(html: string | undefined | null): boolean {
  if (html == null || html === '') return true;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text.length === 0;
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
