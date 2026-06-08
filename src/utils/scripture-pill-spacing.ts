/**
 * Ensures document-level spacer characters around scripture pills so adjacent
 * prose is editable and the cursor can land outside the pill chrome.
 */

const WHITESPACE = new Set([' ', '\n', '\r', '\t']);

function isWhitespaceChar(ch: string | undefined): boolean {
  return ch !== undefined && ch !== '' && WHITESPACE.has(ch);
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
): boolean {
  const ranges = collectScripturePillRanges(tr.doc, markTypeName);
  if (ranges.length === 0) return false;

  let modified = false;
  const sorted = [...ranges].sort((a, b) => b.end - a.end);

  for (const { start, end } of sorted) {
    try {
      const $inside = tr.doc.resolve(Math.min(start, tr.doc.content.size - 1));
      const blockStart = $inside.start($inside.depth);
      const blockEnd = $inside.end($inside.depth);

      if (end < blockEnd) {
        const charAfter = tr.doc.textBetween(end, Math.min(end + 1, blockEnd));
        if (charAfter && !isWhitespaceChar(charAfter)) {
          tr.insertText(' ', end);
          modified = true;
        }
      }

      if (start > blockStart) {
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
