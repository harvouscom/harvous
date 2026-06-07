import Paragraph from '@tiptap/extension-paragraph';

/**
 * Empty paragraphs serialize as `<p><br></p>` so intentional blank lines survive
 * getHTML(), autosave, and scripture-pill normalization round-trips.
 * Blank-line persistence is handled at serialize/save time (renderHTML + canonicalizeNoteHtmlLineBreaks),
 * not via live doc mutation — injecting hardBreaks during editing fights backspace/join.
 */
export const ParagraphCustom = Paragraph.extend({
  renderHTML({ node, HTMLAttributes }) {
    if (node.content.size === 0) {
      return ['p', HTMLAttributes, ['br']];
    }
    return ['p', HTMLAttributes, 0];
  },
});
