import Paragraph from '@tiptap/extension-paragraph';

/**
 * Standard paragraph node — intentionally WITHOUT a `renderHTML` override.
 *
 * `renderHTML` is not serialize-only: ProseMirror uses it as the node's live `toDOM`.
 * A spec that returns `['p', attrs, ['br']]` (e.g. to force `<p><br></p>` for empty
 * paragraphs) has no content hole (`0`), so ProseMirror renders the node as a
 * non-editable leaf — `contenteditable="false"`. A brand-new note is a single empty
 * paragraph, so that override made new notes impossible to type into.
 *
 * Blank-line persistence is handled entirely at save time by
 * `canonicalizeNoteHtmlLineBreaks` (rewrites `<p></p>` → `<p><br></p>`), so the live
 * editor keeps empty paragraphs fully editable while saved HTML still preserves blanks.
 */
export const ParagraphCustom = Paragraph;
