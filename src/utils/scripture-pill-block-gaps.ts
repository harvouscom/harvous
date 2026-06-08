/**
 * Block-level blank line helpers for scripture pill spacing and hydrate persistence guards.
 */

import { canonicalizeNoteHtmlLineBreaks } from './note-html-linebreaks';

const BLANK_PARAGRAPH_RE = /<p[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>/gi;

/** Count empty or br-only paragraphs in note HTML. */
export function countBlankParagraphs(html: string): number {
  return (html.match(BLANK_PARAGRAPH_RE) || []).length;
}

/** True when outgoing HTML has fewer blank paragraphs than incoming (structural regression). */
export function hasLostBlockGaps(before: string, after: string): boolean {
  const incoming = canonicalizeNoteHtmlLineBreaks(before);
  const outgoing = canonicalizeNoteHtmlLineBreaks(after);
  return countBlankParagraphs(outgoing) < countBlankParagraphs(incoming);
}

function isBlankParagraph(node: any): boolean {
  if (!node?.isTextblock) return false;
  if (node.childCount === 0) return true;
  if (node.childCount === 1 && node.firstChild?.type?.name === 'hardBreak') return true;
  return node.textContent.trim().length === 0;
}

function siblingBlockGap(
  doc: any,
  pos: number,
  direction: 'before' | 'after',
): boolean {
  try {
    const $pos = doc.resolve(pos);
    for (let d = $pos.depth; d >= 1; d--) {
      const node = $pos.node(d);
      if (!node.isTextblock) continue;
      const parent = $pos.node(d - 1);
      const index = $pos.index(d - 1);
      if (direction === 'before' && index > 0) {
        return isBlankParagraph(parent.child(index - 1));
      }
      if (direction === 'after' && index + 1 < parent.childCount) {
        return isBlankParagraph(parent.child(index + 1));
      }
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

/** Previous sibling block is an empty or br-only paragraph. */
export function hasBlockGapBefore(doc: any, pos: number): boolean {
  return siblingBlockGap(doc, pos, 'before');
}

/** Next sibling block is an empty or br-only paragraph. */
export function hasBlockGapAfter(doc: any, pos: number): boolean {
  return siblingBlockGap(doc, pos, 'after');
}
