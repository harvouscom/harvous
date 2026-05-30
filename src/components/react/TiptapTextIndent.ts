import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textIndent: {
      increaseIndent: () => ReturnType;
      decreaseIndent: () => ReturnType;
    };
  }
}

// 24px per level — visually close to native's 20pt (~26.7px at 96dpi)
const INDENT_STEP = 24;
const MAX_INDENT = 240; // 10 levels

/**
 * Paragraph-level margin-left indentation for TipTap.
 * Matches native iOS/macOS indent behaviour: any block (paragraph, heading)
 * can be indented regardless of whether it's in a list.
 *
 * The `indent` attribute is stored as an absolute px value and rendered as
 * `margin-left: Npx` on the block element.
 */
export const TextIndent = Extension.create({
  name: 'textIndent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: element => {
              const ml = element.style.marginLeft;
              if (!ml) return 0;
              return parseInt(ml, 10) || 0;
            },
            renderHTML: attributes => {
              const indent = (attributes.indent as number) || 0;
              if (indent === 0) return {};
              return { style: `margin-left: ${indent}px` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      increaseIndent:
        () =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isBlock) return;
            if (!['paragraph', 'heading'].includes(node.type.name)) return;
            const current = (node.attrs.indent as number) || 0;
            const next = Math.min(current + INDENT_STEP, MAX_INDENT);
            if (next !== current && dispatch) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            }
          });
          return true;
        },

      decreaseIndent:
        () =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          let hasIndentedBlock = false;
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isBlock) return;
            if (!['paragraph', 'heading'].includes(node.type.name)) return;
            const current = (node.attrs.indent as number) || 0;
            if (current === 0) return;
            hasIndentedBlock = true;
            const next = Math.max(current - INDENT_STEP, 0);
            if (next !== current && dispatch) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            }
          });
          // Return true when there's something to remove (allows can().decreaseIndent() to work)
          return hasIndentedBlock;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        // Don't intercept Tab inside list items — TipTap handles sink there.
        if (this.editor.isActive('listItem')) return false;
        return this.editor.commands.increaseIndent();
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('listItem')) return false;
        return this.editor.commands.decreaseIndent();
      },
    };
  },
});
