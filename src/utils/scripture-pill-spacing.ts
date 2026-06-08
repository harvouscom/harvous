/**
 * Ensures document-level spacer characters around scripture pills so adjacent
 * prose is editable and the cursor can land outside the pill chrome.
 */

import { hasBlockGapAfter, hasBlockGapBefore } from './scripture-pill-block-gaps';

export type ScripturePillSpacingMode = 'live' | 'hydrate';

const WHITESPACE = new Set([' ', '\n', '\r', '\t']);

function isWhitespaceChar(ch: string | undefined): boolean {
  return ch !== undefined && ch !== '' && WHITESPACE.has(ch);
}

function isHardBreakNode(doc: { nodeAt: (pos: number) => any }, pos: number): boolean {
  try {
    const node = doc.nodeAt(pos);
    return node?.type?.name === 'hardBreak';
  } catch {
    return false;
  }
}

function hasInlineBreakBefore(doc: any, pos: number): boolean {
  if (pos <= 0) return false;
  if (isHardBreakNode(doc, pos - 1)) return true;
  const charBefore = doc.textBetween(pos - 1, pos);
  return charBefore === '\n' || charBefore === '\r';
}

function hasInlineBreakAfter(doc: any, pos: number, blockEnd: number): boolean {
  if (pos >= blockEnd) return false;
  if (isHardBreakNode(doc, pos)) return true;
  const charAfter = doc.textBetween(pos, Math.min(pos + 1, blockEnd));
  return charAfter === '\n' || charAfter === '\r';
}

/** Collect merged [start, end) ranges from text nodes carrying scripturePill marks. */
export function collectScripturePillRanges(
  doc: { content: { size: number }; nodesBetween: (from: number, to: number, f: (node: any, pos: number) => void) => void },
  markTypeName = 'scripturePill',
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (!node.isText) return;
    const hasPill = node.marks?.some((m: any) => m.type.name === markTypeName);
    if (!hasPill) return;

    const nodeStart = pos;
    const nodeEnd = pos + node.text.length;
    const last = ranges[ranges.length - 1];
    if (last && last.end === nodeStart) {
      last.end = nodeEnd;
    } else {
      ranges.push({ start: nodeStart, end: nodeEnd });
    }
  });

  return ranges;
}

/**
 * Insert leading/trailing spaces around scripture pills when missing.
 * Process right-to-left so earlier positions stay valid.
 */
export function ensureScripturePillSpacing(
  tr: { doc: any; insertText: (text: string, pos: number) => void },
  markTypeName = 'scripturePill',
  mode: ScripturePillSpacingMode = 'live',
): boolean {
  if (mode === 'hydrate') return false;

  const ranges = collectScripturePillRanges(tr.doc, markTypeName);
  if (ranges.length === 0) return false;

  let modified = false;
  const sorted = [...ranges].sort((a, b) => b.end - a.end);

  for (const { start, end } of sorted) {
    try {
      const $inside = tr.doc.resolve(Math.min(start, tr.doc.content.size - 1));
      const blockStart = $inside.start($inside.depth);
      const blockEnd = $inside.end($inside.depth);

      if (
        end < blockEnd &&
        !hasInlineBreakAfter(tr.doc, end, blockEnd) &&
        !hasBlockGapAfter(tr.doc, end)
      ) {
        const charAfter = tr.doc.textBetween(end, Math.min(end + 1, blockEnd));
        if (charAfter && !isWhitespaceChar(charAfter)) {
          tr.insertText(' ', end);
          modified = true;
        }
      }

      if (
        start > blockStart &&
        !hasInlineBreakBefore(tr.doc, start) &&
        !hasBlockGapBefore(tr.doc, start)
      ) {
        const charBefore = tr.doc.textBetween(start - 1, start);
        if (charBefore && !isWhitespaceChar(charBefore)) {
          tr.insertText(' ', start);
          modified = true;
        }
      }
    } catch {
      /* skip range */
    }
  }

  return modified;
}
