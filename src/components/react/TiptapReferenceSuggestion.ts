import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  findReferenceSuggestionRanges,
  REFERENCE_SUGGESTION_REFRESH_META,
  type ReferenceProvider,
} from '@/utils/reference-suggestion-text';

/**
 * The ProseMirror half of inline reference suggestions. The text half — providers, the scan,
 * passage HTML decoration — lives in `@/utils/reference-suggestion-text` so non-editor surfaces
 * can use it without loading TipTap; it is re-exported here so editor imports read as before.
 */
export * from '@/utils/reference-suggestion-text';

export const referenceSuggestionPluginKey = new PluginKey<DecorationSet>('referenceSuggestion');

/**
 * Marks whose text must never carry a suggestion — a word already inside a scripture
 * pill, a mention pill, an existing highlight/reference, or a link is left alone (no
 * double-marking).
 */
const EXCLUDED_MARK_NAMES = new Set(['scripturePill', 'mentionPill', 'highlight', 'noteLink', 'urlLink']);

/**
 * Build the decoration set for the whole document. Words inside excluded marks are
 * skipped wholesale (marks span entire text-node runs).
 */
export function buildReferenceSuggestionDecorations(
  doc: PMNode,
  providers: ReferenceProvider[],
): DecorationSet {
  if (providers.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return undefined;
    const text = node.text ?? '';
    if (!text) return false;
    if (node.marks.some((m) => EXCLUDED_MARK_NAMES.has(m.type.name))) return false;
    for (const range of findReferenceSuggestionRanges(text, providers)) {
      const from = pos + range.start;
      const to = pos + range.end;
      const attrs: Record<string, string> = {
        class: 'reference-suggestion',
        'data-reference-word': range.word,
        'data-reference-type': range.type,
      };
      if (range.slug) attrs['data-reference-slug'] = range.slug;
      decorations.push(Decoration.inline(from, to, attrs));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export interface ReferenceSuggestionOptions {
  /** Providers to run, highest priority first. */
  getProviders: () => ReferenceProvider[];
  /** Gate the whole feature (e.g. only in the prototype/native chrome). */
  enabled: () => boolean;
}

export const ReferenceSuggestion = Extension.create<ReferenceSuggestionOptions>({
  name: 'referenceSuggestion',

  addOptions() {
    return {
      getProviders: () => [],
      enabled: () => true,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<DecorationSet>({
        key: referenceSuggestionPluginKey,
        state: {
          init: (_config, state) => {
            if (!options.enabled()) return DecorationSet.empty;
            return buildReferenceSuggestionDecorations(state.doc, options.getProviders());
          },
          apply: (tr, oldSet, _oldState, newState) => {
            const forceRefresh = tr.getMeta(REFERENCE_SUGGESTION_REFRESH_META) === true;
            if (!tr.docChanged && !forceRefresh) {
              return oldSet.map(tr.mapping, tr.doc);
            }
            if (!options.enabled()) return DecorationSet.empty;
            return buildReferenceSuggestionDecorations(newState.doc, options.getProviders());
          },
        },
        props: {
          decorations(state) {
            return referenceSuggestionPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
