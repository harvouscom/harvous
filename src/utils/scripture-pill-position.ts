/**
 * Cursor-anchored scripture reference position lookup and flexible text matching.
 */

import { detectScriptureReferences } from './scripture-detector';

/** Normalize text for flexible matching (spacing + dash types). */
export function normalizeTextForMatching(text: string): string {
  return text
    .replace(/[-–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/:\s+/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Build flexible regex tokens for verse-reference spacing and dash variants. */
function buildFlexiblePattern(searchText: string): string {
  const tokens = searchText.split(/(\s*[-–—]\s*|\s*:\s*|\s+)/);
  return tokens
    .map((token) => {
      if (/^\s*[-–—]\s*$/.test(token)) return '\\s*[-–—]\\s*';
      if (/^\s*:\s*$/.test(token)) return '\\s*:\\s*';
      if (/^\s+$/.test(token)) return '\\s+';
      return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
}

/**
 * Find text positions with flexible matching for verse ranges and dash types.
 */
export function findTextWithFlexibleMatching(
  fullText: string,
  searchText: string,
): Array<{ index: number; length: number }> {
  const matches: Array<{ index: number; length: number }> = [];

  let index = fullText.indexOf(searchText);
  while (index !== -1) {
    matches.push({ index, length: searchText.length });
    index = fullText.indexOf(searchText, index + 1);
  }

  if (matches.length === 0) {
    try {
      const flexiblePattern = buildFlexiblePattern(searchText);
      const regex = new RegExp(flexiblePattern, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(fullText)) !== null) {
        const matchIndex = match.index;
        const matchLength = match[0].length;
        if (!matches.some((m) => m.index === matchIndex)) {
          matches.push({ index: matchIndex, length: matchLength });
        }
      }
    } catch {
      /* invalid pattern */
    }
  }

  return matches;
}

/** Chapter-only ref matched as prefix of "Book 5:1" — not a standalone chapter reference. */
function isChapterOnlyPrefixBeforeVerse(
  text: string,
  matchIndex: number,
  matchLength: number,
  reference: string,
): boolean {
  if (reference.includes(':')) return false;
  return /^:\d/.test(text.slice(matchIndex + matchLength));
}

function filterReferenceMatches(
  text: string,
  matches: Array<{ index: number; length: number }>,
  reference: string,
): Array<{ index: number; length: number }> {
  return matches.filter((m) => !isChapterOnlyPrefixBeforeVerse(text, m.index, m.length, reference));
}

function buildTextToDocMap(doc: any): Array<{ textStart: number; textEnd: number; docStart: number }> {
  const map: Array<{ textStart: number; textEnd: number; docStart: number }> = [];
  let currentPos = 0;
  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (!node.isText) return;
    const text = node.text || '';
    map.push({
      textStart: currentPos,
      textEnd: currentPos + text.length,
      docStart: pos,
    });
    currentPos += text.length;
  });
  return map;
}

function textOffsetToDocRange(
  doc: any,
  textToDocMap: Array<{ textStart: number; textEnd: number; docStart: number }>,
  textIndex: number,
  matchLength: number,
): { from: number; to: number } | null {
  for (const map of textToDocMap) {
    if (textIndex >= map.textStart && textIndex < map.textEnd) {
      const offset = textIndex - map.textStart;
      return { from: map.docStart + offset, to: map.docStart + offset + matchLength };
    }
  }
  return null;
}

/** Map an index within doc.textBetween(sliceFrom, sliceTo) to an absolute document position. */
export function mapSliceIndexToDocPos(
  doc: any,
  sliceFrom: number,
  sliceTo: number,
  indexInSlice: number,
): number | null {
  let counted = 0;
  let found: number | null = null;
  doc.nodesBetween(sliceFrom, sliceTo, (node: any, pos: number) => {
    if (!node.isText || found !== null) return;
    const text = node.text || '';
    const startOffset = sliceFrom > pos ? sliceFrom - pos : 0;
    const endOffset = sliceTo < pos + text.length ? sliceTo - pos : text.length;
    if (endOffset <= startOffset) return;
    const visibleLen = endOffset - startOffset;
    const visibleStart = counted;
    const visibleEnd = counted + visibleLen;
    if (indexInSlice >= visibleStart && indexInSlice < visibleEnd) {
      found = pos + startOffset + (indexInSlice - visibleStart);
    }
    counted += visibleLen;
  });
  return found;
}

/**
 * Slice start for cursor-anchored reference detection: clamp to the current textblock
 * start so the previous block's last char never glues onto the reference (which would
 * kill the detector's leading `\b` word boundary). A reference never spans textblocks,
 * so this only removes false negatives. Consistent with `mapSliceIndexToDocPos`, which
 * counts only the text within [sliceFrom, cursorPos].
 */
export function scriptureSliceStart(doc: any, cursorPos: number, textWindow: number): number {
  let blockStart = 1;
  try {
    const $pos = doc.resolve(cursorPos);
    blockStart = $pos.start($pos.depth);
  } catch {
    /* fall back to window / doc start */
  }
  return Math.max(blockStart, cursorPos - textWindow, 1);
}

/**
 * Map a reference string within a doc slice ending at cursorPos to absolute doc range.
 */
export function mapReferenceEndInSliceToDocPos(
  doc: any,
  cursorPos: number,
  reference: string,
  textWindow = 80,
): { from: number; to: number } | null {
  const sliceDocFrom = scriptureSliceStart(doc, cursorPos, textWindow);
  const slice = doc.textBetween(sliceDocFrom, cursorPos);
  const trimmedRef = reference.trim();
  const matches = filterReferenceMatches(slice, findTextWithFlexibleMatching(slice, trimmedRef), trimmedRef);
  if (matches.length === 0) return null;

  const best = matches.reduce((a, b) => {
    const aEnd = a.index + a.length;
    const bEnd = b.index + b.length;
    return bEnd >= aEnd ? b : a;
  });

  const docFrom = mapSliceIndexToDocPos(doc, sliceDocFrom, cursorPos, best.index);
  if (docFrom === null) return null;
  return { from: docFrom, to: docFrom + best.length };
}

/**
 * Map a reference string to the doc position ending nearest the cursor.
 */
export function findScriptureReferenceAtCursor(
  doc: any,
  reference: string,
  cursorPos: number,
  textWindow = 80,
): { from: number; to: number } | null {
  const trimmedRef = reference.trim();
  const sliceDocFrom = scriptureSliceStart(doc, cursorPos, textWindow);
  const slice = doc.textBetween(sliceDocFrom, cursorPos);
  if (!slice.trim()) return null;

  const textToDocMap = buildTextToDocMap(doc);
  const fullText = doc.textContent;

  const sliceMatches = filterReferenceMatches(slice, findTextWithFlexibleMatching(slice, trimmedRef), trimmedRef);
  if (sliceMatches.length > 0) {
    const best = sliceMatches.reduce((a, b) => {
      const aEnd = a.index + a.length;
      const bEnd = b.index + b.length;
      return bEnd >= aEnd ? b : a;
    });
    const docFrom = mapSliceIndexToDocPos(doc, sliceDocFrom, cursorPos, best.index);
    if (docFrom !== null) {
      return { from: docFrom, to: docFrom + best.length };
    }
  }

  const allMatches = filterReferenceMatches(
    fullText,
    findTextWithFlexibleMatching(fullText, trimmedRef),
    trimmedRef,
  );
  if (allMatches.length === 0) return null;

  let bestRange: { from: number; to: number } | null = null;
  let bestDist = Infinity;
  for (const m of allMatches) {
    const range = textOffsetToDocRange(doc, textToDocMap, m.index, m.length);
    if (!range) continue;
    const dist = Math.min(Math.abs(range.to - cursorPos), Math.abs(range.from - cursorPos));
    if (dist < bestDist) {
      bestDist = dist;
      bestRange = range;
    }
  }
  return bestRange;
}

export type CursorEndingReference = {
  reference: string;
  from: number | null;
  to: number | null;
};

/** Chapter-level reference without verse (e.g. "Exodus 5"). */
export function isChapterOnlyScriptureReference(reference: string): boolean {
  return !reference.includes(':');
}

/**
 * Whether debounced/onUpdate scripture detection should run.
 * Chapter-only refs pill only at word boundaries (Space/Enter/comma/period/newline);
 * otherwise typing "Exodus 5:1-2" would pill "Exodus 5" mid-stream.
 */
export function shouldSchedulePassiveScriptureDetection(
  doc: any,
  cursorPos: number,
  isBoundaryCursor: boolean,
  textWindow = 80,
): boolean {
  const cursorEnding = detectScriptureReferenceEndingAtCursor(doc, cursorPos, textWindow);
  if (cursorEnding == null) return isBoundaryCursor;
  if (!isChapterOnlyScriptureReference(cursorEnding.reference)) return true;
  return isBoundaryCursor;
}

function matchEndsAtCursor(textBeforeCursor: string, refText: string, windowLen: number): number {
  const matches = findTextWithFlexibleMatching(textBeforeCursor, refText);
  let bestEnd = -1;
  for (const m of matches) {
    const end = m.index + m.length;
    const tail = textBeforeCursor.slice(end);
    if (end > bestEnd && end <= windowLen && (tail === '' || /^\s+$/.test(tail))) {
      bestEnd = end;
    }
  }
  return bestEnd;
}

/**
 * Detect references in text before cursor and return the one ending closest to the cursor.
 * Position lookup may be deferred (from/to null) — callers resolve via createPendingPillsForReferences.
 */
export function detectScriptureReferenceEndingAtCursor(
  doc: any,
  cursorPos: number,
  textWindow = 80,
): CursorEndingReference | null {
  const sliceDocFrom = scriptureSliceStart(doc, cursorPos, textWindow);
  const textBeforeCursor = doc.textBetween(sliceDocFrom, cursorPos);
  const refs = detectScriptureReferences(textBeforeCursor);
  if (refs.length === 0) return null;

  const windowLen = textBeforeCursor.length;
  let bestRef = refs[0];
  let bestEnd = -1;
  for (const ref of refs) {
    const end = matchEndsAtCursor(textBeforeCursor, ref.reference, windowLen);
    if (end > bestEnd) {
      bestEnd = end;
      bestRef = ref;
    }
  }

  if (bestEnd < 0) {
    for (let i = refs.length - 1; i >= 0; i--) {
      const end = matchEndsAtCursor(textBeforeCursor, refs[i].reference, windowLen);
      if (end >= 0) {
        bestRef = refs[i];
        bestEnd = end;
        break;
      }
    }
  }

  if (bestEnd < 0) return null;

  const pos =
    findScriptureReferenceAtCursor(doc, bestRef.reference, cursorPos, textWindow) ||
    mapReferenceEndInSliceToDocPos(doc, cursorPos, bestRef.reference, textWindow);

  return {
    reference: bestRef.reference,
    from: pos?.from ?? null,
    to: pos?.to ?? null,
  };
}
