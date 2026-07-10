import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { lookupWord, type EastonCategory } from '../../../spa/src/hooks/useEastonsSlugIndex';
import { getBookNameVariations } from '@/utils/scripture-detector';
import {
  isCapitalizedToken,
  shouldSkipPersonNameContext,
  PERSON_NAME_HONORIFIC_PREFIXES,
} from '@/utils/person-name-context';

/**
 * Inline reference suggestions ("dotted underline" hints) while typing.
 *
 * As the user writes, words that match something they already have saved — for now,
 * Easton's Bible Dictionary entries — get a faint, ephemeral underline. The hint is
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

/** Minimum headword / token length — skips ultra-short index entries like "A" or "Ai". */
export const REFERENCE_SUGGESTION_MIN_LENGTH = 3;

/** True when an Easton's row is long enough to surface as a suggestion. */
export function isSuggestibleEastonEntry(entry: { headword: string }): boolean {
  return entry.headword.length >= REFERENCE_SUGGESTION_MIN_LENGTH;
}

/** Honorific tokens before a capitalized name — keep in sync with native `PersonNameContextGate`. */
export const REFERENCE_SUGGESTION_HONORIFIC_PREFIXES = PERSON_NAME_HONORIFIC_PREFIXES;

/** True when the first letter is an uppercase letter (proper-noun gate). */
export function isCapitalizedWord(word: string): boolean {
  return isCapitalizedToken(word);
}

/** Person/place keep the capitalized proper-noun gate; things match in any case. */
function entryAllowsTokenCase(category: EastonCategory, word: string): boolean {
  if (category === 'thing') return true;
  return isCapitalizedWord(word);
}

/**
 * Dictionary provider: suggests when the token and matched Easton's row meet length
 * gates, the word is not stoplisted, and person/place tokens are capitalized (things
 * match regardless of case). `getIndex` is read lazily so the provider works before
 * the index has finished loading.
 */
export function createDictionaryReferenceProvider(
  getIndex: () => EastonsIndex,
): ReferenceProvider {
  return {
    type: 'dictionary',
    match(word) {
      if (word.length < REFERENCE_SUGGESTION_MIN_LENGTH) return null;
      if (REFERENCE_SUGGESTION_STOPLIST.has(word.toLowerCase())) return null;
      const entry = lookupWord(word, getIndex());
      if (!entry || !isSuggestibleEastonEntry(entry)) return null;
      if (!entryAllowsTokenCase(entry.category, word)) return null;
      return { type: 'dictionary', word, slug: entry.slug };
    },
  };
}

export const referenceSuggestionPluginKey = new PluginKey<DecorationSet>('referenceSuggestion');

/** Set this meta on a transaction to force a recompute (e.g. once the index loads). */
export const REFERENCE_SUGGESTION_REFRESH_META = 'referenceSuggestionRefresh';

/**
 * Marks whose text must never carry a suggestion — a word already inside a scripture
 * pill, a mention pill, an existing highlight/reference, or a link is left alone (no
 * double-marking).
 */
const EXCLUDED_MARK_NAMES = new Set(['scripturePill', 'mentionPill', 'highlight', 'noteLink', 'urlLink']);

/** Word token: a letter (incl. Latin-1/extended) followed by letters, apostrophes, hyphens. */
const WORD_REGEX = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*/g;

const BIBLE_BOOK_NAMES_LOWER = new Set(getBookNameVariations().map((n) => n.toLowerCase()));

export interface ReferenceSuggestionRange {
  start: number;
  end: number;
  word: string;
  slug?: string;
  type: string;
}

/**
 * Scan plain text for reference-suggestion ranges (same rules as the ProseMirror decoration pass).
 */
export function findReferenceSuggestionRanges(
  text: string,
  providers: ReferenceProvider[],
): ReferenceSuggestionRange[] {
  if (!text || providers.length === 0) return [];
  const ranges: ReferenceSuggestionRange[] = [];
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
    if (isLikelyChapterHeadingLabel(word, text, m.index + word.length)) continue;
    if (shouldSkipPersonNameContext(word, text, m.index, m.index + word.length)) continue;
    ranges.push({
      start: m.index,
      end: m.index + word.length,
      word: match.word,
      slug: match.slug,
      type: match.type,
    });
  }
  return ranges;
}

/** Skip Easton's hint when a Bible book name is followed by chapter/verse digits in the same text node. */
function isLikelyScriptureReferenceInProgress(word: string, text: string, wordEndInText: number): boolean {
  if (!BIBLE_BOOK_NAMES_LOWER.has(word.toLowerCase())) return false;
  const after = text.slice(wordEndInText);
  return /^\s*\d/.test(after);
}

/** Skip Easton's hint on "Chapter" when it is a passage heading label (e.g. "Chapter 6"). */
export function isLikelyChapterHeadingLabel(word: string, text: string, wordEndInText: number): boolean {
  if (word.toLowerCase() !== 'chapter') return false;
  const after = text.slice(wordEndInText);
  return /^\s*\d/.test(after);
}

export { shouldSkipPersonNameContext } from '@/utils/person-name-context';

const PASSAGE_SUGGESTION_SKIP_SELECTOR =
  'sup.verse-num, .reference-suggestion, mark, .highlight, .scripture-pill-chrome__passage-highlights, .scripture-pill-chrome__attribution, .passage-chapter-heading, .scripture-pill-chrome__trans-chip';

function shouldSkipPassageSuggestionTextNode(node: Text): boolean {
  let parent: HTMLElement | null = node.parentElement;
  while (parent) {
    if (parent.matches(PASSAGE_SUGGESTION_SKIP_SELECTOR)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function wrapPassageTextNodeWithSuggestions(textNode: Text, providers: ReferenceProvider[]): void {
  const originalText = textNode.textContent ?? '';
  const ranges = findReferenceSuggestionRanges(originalText, providers);
  if (ranges.length === 0) return;

  const parent = textNode.parentNode;
  if (!parent) return;

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const range of sorted) {
    if (range.start > cursor) {
      fragment.appendChild(document.createTextNode(originalText.slice(cursor, range.start)));
    }
    const span = document.createElement('span');
    span.className = 'reference-suggestion';
    span.setAttribute('data-reference-word', range.word);
    span.setAttribute('data-reference-type', range.type);
    if (range.slug) span.setAttribute('data-reference-slug', range.slug);
    span.textContent = originalText.slice(range.start, range.end);
    fragment.appendChild(span);
    cursor = range.end;
  }
  if (cursor < originalText.length) {
    fragment.appendChild(document.createTextNode(originalText.slice(cursor)));
  }
  parent.replaceChild(fragment, textNode);
}

export interface PassageHighlightPaint {
  id: string;
  excerpt: string;
  accentRaw: string;
  entryKind: string;
}

/** Normalize passage excerpt for paint matching (mirrors native `StudyThread.normalizedPassageExcerpt`). */
export function normalizePassageExcerpt(excerpt: string): string {
  return excerpt.trim();
}

/**
 * Resolve paint ranges in plain passage text using forward-cursor ordering so duplicate
 * substrings paint in save order without overlapping (native `passageHighlightPaintRanges`).
 */
export function resolvePassagePaintRanges(
  plainText: string,
  paints: PassageHighlightPaint[],
): { paint: PassageHighlightPaint; start: number; end: number }[] {
  if (!plainText || paints.length === 0) return [];

  const positioned: { paint: PassageHighlightPaint; excerpt: string; firstLoc: number; index: number }[] = [];
  paints.forEach((paint, index) => {
    const excerpt = normalizePassageExcerpt(paint.excerpt);
    if (!excerpt) return;
    const firstLoc = plainText.indexOf(excerpt);
    if (firstLoc < 0) return;
    positioned.push({ paint, excerpt, firstLoc, index });
  });
  const sorted = [...positioned].sort((a, b) => a.firstLoc - b.firstLoc || a.index - b.index);

  let cursor = 0;
  const out: { paint: PassageHighlightPaint; start: number; end: number }[] = [];
  for (const entry of sorted) {
    const len = entry.excerpt.length;
    if (len === 0 || cursor > plainText.length - len) continue;
    const searchFrom = plainText.indexOf(entry.excerpt, cursor);
    const start = searchFrom >= 0 ? searchFrom : entry.firstLoc;
    const end = start + len;
    out.push({ paint: entry.paint, start, end });
    cursor = Math.max(cursor, end);
  }
  return out;
}

interface PassageTextSegment {
  node: Text;
  start: number;
  end: number;
}

function collectPassageTextSegments(root: HTMLElement): { plainText: string; segments: PassageTextSegment[] } {
  const segments: PassageTextSegment[] = [];
  let plainText = '';
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    if (!textNode.textContent) continue;
    if (shouldSkipPassageSuggestionTextNode(textNode)) continue;
    const text = textNode.textContent;
    const start = plainText.length;
    plainText += text;
    segments.push({ node: textNode, start, end: start + text.length });
  }
  return { plainText, segments };
}

function wrapPassageRangeWithMark(
  segments: PassageTextSegment[],
  start: number,
  end: number,
  paint: PassageHighlightPaint,
): void {
  if (start >= end) return;
  const referenceWord = normalizePassageExcerpt(paint.excerpt);
  const accent = paint.accentRaw || 'warmAmber';

  const rangesByNode: { node: Text; localStart: number; localEnd: number }[] = [];
  for (const seg of segments) {
    const overlapStart = Math.max(start, seg.start);
    const overlapEnd = Math.min(end, seg.end);
    if (overlapStart >= overlapEnd) continue;
    rangesByNode.push({
      node: seg.node,
      localStart: overlapStart - seg.start,
      localEnd: overlapEnd - seg.start,
    });
  }
  if (rangesByNode.length === 0) return;

  for (const { node, localStart, localEnd } of rangesByNode) {
    const parent = node.parentNode;
    if (!parent) continue;
    const originalText = node.textContent ?? '';
    const fragment = document.createDocumentFragment();
    if (localStart > 0) {
      fragment.appendChild(document.createTextNode(originalText.slice(0, localStart)));
    }
    const mark = document.createElement('mark');
    mark.setAttribute('data-reference', referenceWord);
    mark.setAttribute('data-color', accent);
    mark.setAttribute('data-study-thread-id', paint.id);
    mark.setAttribute('data-entry-kind', paint.entryKind || 'reference');
    mark.textContent = originalText.slice(localStart, localEnd);
    fragment.appendChild(mark);
    if (localEnd < originalText.length) {
      fragment.appendChild(document.createTextNode(originalText.slice(localEnd)));
    }
    parent.replaceChild(fragment, node);
  }
}

/**
 * Paint saved passage highlights (reference + scriptureLink) as inline marks before suggestions.
 */
export function decoratePassageHtmlWithSavedHighlights(
  html: string,
  paints: PassageHighlightPaint[],
): string {
  if (!html || paints.length === 0 || typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<div id="passage-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('passage-root');
  if (!root) return html;

  const { plainText, segments } = collectPassageTextSegments(root);
  const resolved = resolvePassagePaintRanges(plainText, paints);
  if (resolved.length === 0) return html;

  // Apply from end to start so earlier offsets stay valid after DOM splits.
  const sortedDesc = [...resolved].sort((a, b) => b.start - a.start);
  for (const { paint, start, end } of sortedDesc) {
    const fresh = collectPassageTextSegments(root);
    wrapPassageRangeWithMark(fresh.segments, start, end, paint);
  }

  return root.innerHTML;
}

/**
 * Inject reference-suggestion spans into static passage HTML before React renders it.
 */
export function decoratePassageHtmlWithReferenceSuggestions(
  html: string,
  providers: ReferenceProvider[],
): string {
  if (!html || providers.length === 0 || typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<div id="passage-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('passage-root');
  if (!root) return html;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    if (!textNode.textContent?.trim()) continue;
    if (shouldSkipPassageSuggestionTextNode(textNode)) continue;
    textNodes.push(textNode);
  }

  for (const textNode of textNodes) {
    wrapPassageTextNodeWithSuggestions(textNode, providers);
  }

  return root.innerHTML;
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
