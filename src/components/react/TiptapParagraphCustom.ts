import Paragraph from '@tiptap/extension-paragraph';
import { Plugin } from '@tiptap/pm/state';

/**
 * Empty paragraphs serialize as `<p><br></p>` so intentional blank lines survive
 * getHTML(), autosave, and scripture-pill normalization round-trips.
 */
export const ParagraphCustom = Paragraph.extend({
  renderHTML({ node, HTMLAttributes }) {
    if (node.content.size === 0) {
      return ['p', HTMLAttributes, ['br']];
    }
    return ['p', HTMLAttributes, 0];
  },

  addProseMirrorPlugins() {
    const parent = this.parent?.() ?? [];
    return [
      ...parent,
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const { paragraph, hardBreak } = newState.schema.nodes;
          if (!paragraph || !hardBreak) return null;

          const emptyPositions: number[] = [];
          newState.doc.descendants((node, pos) => {
            if (node.type === paragraph && node.childCount === 0) {
              emptyPositions.push(pos);
            }
          });
          if (emptyPositions.length === 0) return null;

          let tr = newState.tr;
          for (let i = emptyPositions.length - 1; i >= 0; i--) {
            tr = tr.insert(emptyPositions[i] + 1, hardBreak.create());
          }
          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});
