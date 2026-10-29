/**
 * The words a reader selected in a rendered passage, as they read them.
 *
 * `Selection.toString()` is the wrong source for a highlight or a quote: it includes verse
 * numerals ("…milk and honey. 3 Go up…"), chapter headings, and text that is only there for
 * screen readers (", printed as", "in 3 of your notes") whenever a drag crosses them. The
 * saved excerpt then never matches the passage the painter walks, and the quote carries
 * stray digits. This walks the range's text nodes instead, skipping everything a reader
 * doesn't see as passage text.
 *
 * Two shapes, because two consumers compare against different things:
 * - `'read'` (a quote): one space at each block boundary and whitespace collapsed, so it
 *   reads as prose.
 * - `'paint'` (a saved highlight excerpt): the text nodes concatenated exactly, because the
 *   painter (`decoratePassageHtmlWithSavedHighlights`) finds the excerpt by `indexOf` in that
 *   same concatenation. Any separator or collapsed run would make it never paint.
 */
export const PASSAGE_SELECTION_SKIP_SELECTOR = [
  'sup.verse-num',
  'sup.pds-reader-verse-num',
  '.passage-chapter-heading',
  '.proto-visually-hidden',
  '.sr-only',
  '[aria-hidden="true"]',
].join(', ');

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'TR']);

function skipped(node: Text, root: Node): boolean {
  let el = node.parentElement;
  while (el && el !== root) {
    if (el.matches(PASSAGE_SELECTION_SKIP_SELECTOR)) return true;
    el = el.parentElement;
  }
  return false;
}

function nearestBlock(node: Node, root: Node): Element | null {
  let el = node.parentElement;
  while (el && el !== root) {
    // A reader verse is an inline span, but it is a unit of text all the same: two verses
    // read as "…the way. When the people…", not "…the way.When…".
    if (BLOCK_TAGS.has(el.tagName) || el.hasAttribute('data-reader-verse')) return el;
    el = el.parentElement;
  }
  return null;
}

export type PassageSelectionTextMode = 'read' | 'paint';

export function passageSelectionText(
  range: Range,
  root: Node = range.commonAncestorContainer,
  mode: PassageSelectionTextMode = 'read',
): string {
  const scope = root.nodeType === Node.TEXT_NODE ? root.parentNode ?? root : root;
  const doc = (scope as Node).ownerDocument ?? document;
  const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let out = '';
  let lastBlock: Element | null | undefined;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const text = current as Text;
    if (!range.intersectsNode(text) || skipped(text, scope)) continue;
    let value = text.data;
    if (text === range.endContainer) value = value.slice(0, range.endOffset);
    if (text === range.startContainer) value = value.slice(range.startOffset);
    if (!value) continue;
    if (mode === 'read') {
      const block = nearestBlock(text, scope);
      if (lastBlock !== undefined && block !== lastBlock) out += ' ';
      lastBlock = block;
    }
    out += value;
  }
  return mode === 'read' ? out.replace(/\s+/g, ' ').trim() : out.trim();
}

/** The live selection's range when it is non-empty and inside `container`, else null. */
export function liveSelectionRangeWithin(container: HTMLElement | null): Range | null {
  if (!container || typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return container.contains(range.commonAncestorContainer) ? range : null;
}
