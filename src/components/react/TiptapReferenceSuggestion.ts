import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { lookupWord, type EastonCategory } from '../../../spa/src/hooks/useEastonsSlugIndex';
import { getBookNameVariations } from '@/utils/scripture-detector';

/**
 * Inline reference suggestions ("dotted underline" hints) while typing.
 *
 * As the user writes, words that match something they already have saved — for now,
 * Easton's Bible Dictionary people/places — get a faint, ephemeral underline. The hint is
 * NEVER written into note content: it's a ProseMirror decoration computed at render time
 * from a live scan of the document. Only when the user taps the hint and chooses "Save
 * reference" does it become a persisted `data-reference` highlight mark (handled in
 * TiptapEditor / ReferenceDockWeb, reusing the existing reference-save path).
 *
 * The matcher is provider-based so future reference types (the "references will expand
 * like highlights" goal) slot in alongside `dictionary` without touching the plugin.
 */

/** The Easton's index shape, derived from `lookupWord` so we don't re-declare it. */
export type EastonsIndex = Parameters<typeof lookupWord>[1];

export interface ReferenceSuggestionMatch {
  /** Reference type — `dictionary` today; future types reuse this field. */
  type: string;
  /** The matched token exactly as it appears in the text. */
  word: string;
  /** Optional canonical key (e.g. Easton's slug) for downstream lookup. */
  slug?: string;
}

export interface ReferenceProvider {
  type: string;
  /** Return a match for `word`, or null to leave it un-suggested. */
  match(word: string): ReferenceSuggestionMatch | null;
}

/**
 * Ultra-common names whose Easton's entries exist but would underline on nearly every
 * note. Skipped so the hint stays meaningful. Tunable — tighten/loosen after dogfooding.
 */
export const REFERENCE_SUGGESTION_STOPLIST = new Set<string>([
  'god',
  'lord',
  'jesus',
  'christ',
  'spirit',
]);

/** Categories we surface as suggestions. Proper-noun signal only — `thing` is too noisy. */
const SUGGESTION_CATEGORIES = new Set<EastonCategory>(['person', 'place']);

/** True when the first letter is an uppercase letter (proper-noun gate). */
export function isCapitalizedWord(word: string): boolean {
  const first = word.charAt(0);
  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase();
}

/**
 * Dictionary provider: suggests a word only when it is capitalized, not stoplisted, and
 * resolves to an Easton's `person`/`place` entry. `getIndex` is read lazily so the
 * provider works before the index has finished loading.
 */
export function createDictionaryReferenceProvider(
  getIndex: () => EastonsIndex,
): ReferenceProvider {
  return {
    type: 'dictionary',
    match(word) {
      if (!isCapitalizedWord(word)) return null;
      if (REFERENCE_SUGGESTION_STOPLIST.has(word.toLowerCase())) return null;
      const entry = lookupWord(word, getIndex());
      if (!entry) return null;
      if (!SUGGESTION_CATEGORIES.has(entry.category)) return null;
      return { type: 'dictionary', word, slug: entry.slug };
    },
  };
}

export const referenceSuggestionPluginKey = new PluginKey<DecorationSet>('referenceSuggestion');

/** Set this meta on a transaction to force a recompute (e.g. once the index loads). */
export const REFERENCE_SUGGESTION_REFRESH_META = 'referenceSuggestionRefresh';

/**
 * Marks whose text must never carry a suggestion — a word already inside a scripture
 * pill, an existing highlight/reference, or a link is left alone (no double-marking).
 */
const EXCLUDED_MARK_NAMES = new Set(['scripturePill', 'highlight', 'noteLink', 'urlLink']);

/** Word token: a letter (incl. Latin-1/extended) followed by letters, apostrophes, hyphens. */
const WORD_REGEX = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*/g;

const BIBLE_BOOK_NAMES_LOWER = new Set(getBookNameVariations().map((n) => n.toLowerCase()));

/** Skip Easton's hint when a Bible book name is followed by chapter/verse digits in the same text node. */
function isLikelyScriptureReferenceInProgress(word: string, text: string, wordEndInText: number): boolean {
  if (!BIBLE_BOOK_NAMES_LOWER.has(word.toLowerCase())) return false;
  const after = text.slice(wordEndInText);
  return /^\s*\d/.test(after);
}

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
    WORD_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD_REGEX.exec(text)) !== null) {
      const word = m[0];
      let match: ReferenceSuggestionMatch | null = null;
      for (const provider of providers) {
        match = provider.match(word);
        if (match) break;
      }
      if (!match) continue;
      if (isLikelyScriptureReferenceInProgress(word, text, m.index + word.length)) continue;
      const from = pos + m.index;
      const to = from + word.length;
      const attrs: Record<string, string> = {
        class: 'reference-suggestion',
        'data-reference-word': match.word,
        'data-reference-type': match.type,
      };
      if (match.slug) attrs['data-reference-slug'] = match.slug;
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
