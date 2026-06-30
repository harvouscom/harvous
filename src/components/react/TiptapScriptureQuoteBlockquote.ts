import Blockquote from '@tiptap/extension-blockquote';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Blockquote with optional scripture pill accent — pairs visually with inline pills
 * via `data-scripture-quote-accent` (see scripture-pill-accent.css).
 */
export function isScriptureQuoteBlockquoteNode(
  node: { type: { name: string }; attrs: Record<string, unknown> } | null | undefined,
): boolean {
  return !!node && node.type.name === 'blockquote' && node.attrs.scriptureQuoteAccent != null;
}

export function isEmptyScriptureQuoteBlockquote(node: ProseMirrorNode): boolean {
  if (!isScriptureQuoteBlockquoteNode(node)) return false;
  return node.textContent.replace(/\u200B/g, '').trim().length === 0;
}

const pruneEmptyScriptureQuotesKey = new PluginKey('pruneEmptyScriptureQuotes');

export const ScriptureQuoteBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      scriptureQuoteAccent: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-scripture-quote-accent'),
        renderHTML: (attributes) => {
          const accent = attributes.scriptureQuoteAccent;
          if (!accent) return {};
          return { 'data-scripture-quote-accent': accent };
        },
      },
      scriptureQuoteReference: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-scripture-quote-reference'),
        renderHTML: (attributes) => {
          const reference = attributes.scriptureQuoteReference;
          if (!reference) return {};
          return { 'data-scripture-quote-reference': reference };
        },
      },
      scriptureQuoteTranslation: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-scripture-quote-translation'),
        renderHTML: (attributes) => {
          const translation = attributes.scriptureQuoteTranslation;
          if (!translation) return {};
          return { 'data-scripture-quote-translation': translation };
        },
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { empty, $from } = editor.state.selection;
        if (!empty) return false;

        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const node = $from.node(depth);
          if (!isEmptyScriptureQuoteBlockquote(node)) continue;
          const from = $from.before(depth);
          const to = $from.after(depth);
          return editor.chain().focus().deleteRange({ from, to }).run();
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pruneEmptyScriptureQuotesKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const toRemove: { from: number; to: number }[] = [];
          newState.doc.descendants((node, pos) => {
            if (isEmptyScriptureQuoteBlockquote(node)) {
              toRemove.push({ from: pos, to: pos + node.nodeSize });
            }
          });
          if (toRemove.length === 0) return null;

          let tr = newState.tr;
          for (let i = toRemove.length - 1; i >= 0; i -= 1) {
            tr = tr.delete(toRemove[i].from, toRemove[i].to);
          }
          return tr;
        },
      }),
    ];
  },
});
