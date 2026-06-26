import { findTextWithFlexibleMatching } from '@/utils/scripture-pill-position';

/**
 * DOM-based find-on-page for the prototype editor.
 *
 * Searches the note editor surface AND any visible study-dock content, then
 * paints matches with the CSS Custom Highlight API. Highlights are drawn via
 * `::highlight()` which — unlike native `::selection` — paints regardless of
 * `user-select`, so matches inside scripture pills (which are `user-select:none`)
 * highlight correctly. It also never mutates the DOM, so it won't fight React's
 * ownership of the dock tree.
 *
 * Known limitation: text inside form controls (`<textarea>`/`<input>`, e.g. the
 * highlight dock's mini-note/title fields) cannot be highlighted by the Highlight
 * API. Only rendered text (excerpts, passages, definitions) is covered.
 */

const MATCH_HIGHLIGHT = 'proto-find-match';
const ACTIVE_HIGHLIGHT = 'proto-find-active';

interface SearchScope {
  /** The container to search. */
  rootSelector: string;
  /**
   * When set, only text inside descendants matching these selectors is searched.
   * Used for the dock so credit/fine-print and UI labels (attribution, copyright,
   * status messages, headers, buttons, "Respond"/"See also", chips) are ignored
   * — only the actual study content is matched.
   */
  contentSelectors?: string[];
}

// Search scopes in visual/document order: the note editor first, then the dock
// layer below it. The editor searches all of its text; the dock is restricted to
// its content bodies.
const SEARCH_SCOPES: SearchScope[] = [
  { rootSelector: '.proto-editor-surface .ProseMirror' },
  {
    rootSelector: '.proto-shell__study-dock-layer',
    contentSelectors: [
      '.scripture-pill-chrome__passage-html', // scripture passage text
      '.reference-dock-web__passage-html', // reference definition body
      '.highlight-dock-web__excerpt-text', // highlight excerpt
    ],
  },
];

interface TextSpan {
  node: Text;
  start: number; // inclusive offset into the concatenated string
  end: number; // exclusive
}

function highlightsSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

/** True when a text node renders a non-zero box (excludes collapsed dock bodies and hidden content). */
function isTextNodeVisible(node: Text): boolean {
  const text = node.textContent ?? '';
  if (!text.trim()) return false;
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Resolve the element(s) to walk for a scope (the root, or its content subtrees). */
function scopeElements(scope: SearchScope): Element[] {
  const root = document.querySelector(scope.rootSelector);
  if (!root) return [];
  if (!scope.contentSelectors?.length) return [root];
  const matched = Array.from(root.querySelectorAll(scope.contentSelectors.join(',')));
  // Drop any element nested inside another matched element to avoid double-walking.
  return matched.filter((el) => !matched.some((other) => other !== el && other.contains(el)));
}

/** Collect visible text nodes under a root into a flat string + offset map. */
function collectSpans(root: Element, baseOffset: number): { text: string; spans: TextSpan[]; nextOffset: number } {
  const spans: TextSpan[] = [];
  let text = '';
  let offset = baseOffset;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      // Skip form-control internals — the Highlight API can't paint inside them.
      if (parent && (parent.closest('textarea') || parent.closest('input'))) {
        return NodeFilter.FILTER_REJECT;
      }
      return isTextNodeVisible(node as Text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let current = walker.nextNode() as Text | null;
  while (current) {
    const value = current.textContent ?? '';
    spans.push({ node: current, start: offset, end: offset + value.length });
    text += value;
    offset += value.length;
    current = walker.nextNode() as Text | null;
  }

  return { text, spans, nextOffset: offset };
}

/** Build a DOM Range spanning [start, end) across the concatenated text spans. */
function rangeForMatch(spans: TextSpan[], start: number, end: number): Range | null {
  let startSpan: TextSpan | undefined;
  let endSpan: TextSpan | undefined;
  for (const span of spans) {
    if (!startSpan && start >= span.start && start < span.end) startSpan = span;
    if (end > span.start && end <= span.end) endSpan = span;
    if (startSpan && endSpan) break;
  }
  if (!startSpan || !endSpan) return null;
  try {
    const range = document.createRange();
    range.setStart(startSpan.node, start - startSpan.start);
    range.setEnd(endSpan.node, end - endSpan.start);
    return range;
  } catch {
    return null;
  }
}

/** Remove all find highlights. */
export function clearProtoFind(): void {
  if (!highlightsSupported()) return;
  CSS.highlights.delete(MATCH_HIGHLIGHT);
  CSS.highlights.delete(ACTIVE_HIGHLIGHT);
}

/**
 * Find `query` across the editor + visible dock content, highlight all matches
 * (active one emphasized), scroll the active match into view, and return the
 * total count and the resolved (wrapped) active index.
 */
export function runProtoFind(query: string, activeIndex: number): { count: number; index: number } {
  const q = query.trim();
  clearProtoFind();
  if (!q || typeof document === 'undefined') return { count: 0, index: 0 };

  // Gather text across all roots into one flat string with a shared offset space.
  let combinedText = '';
  const spans: TextSpan[] = [];
  let offset = 0;
  for (const scope of SEARCH_SCOPES) {
    for (const el of scopeElements(scope)) {
      const collected = collectSpans(el, offset);
      combinedText += collected.text;
      spans.push(...collected.spans);
      offset = collected.nextOffset;
    }
  }

  if (!combinedText) return { count: 0, index: 0 };

  // Case-insensitive matching: lowercase both sides (lengths are preserved).
  const matches = findTextWithFlexibleMatching(combinedText.toLowerCase(), q.toLowerCase());
  if (matches.length === 0) return { count: 0, index: 0 };
  matches.sort((a, b) => a.index - b.index);

  const ranges: Range[] = [];
  for (const match of matches) {
    const range = rangeForMatch(spans, match.index, match.index + match.length);
    if (range) ranges.push(range);
  }
  if (ranges.length === 0) return { count: 0, index: 0 };

  const count = ranges.length;
  const index = ((activeIndex % count) + count) % count;

  if (highlightsSupported()) {
    CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(...ranges));
    const active = new Highlight(ranges[index]);
    active.priority = 1; // draw the active match on top of the faint match layer
    CSS.highlights.set(ACTIVE_HIGHLIGHT, active);
  }

  ranges[index].startContainer.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  return { count, index };
}
