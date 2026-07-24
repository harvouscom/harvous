/**
 * Utility functions for working with Tiptap/ProseMirror editors
 * Shared helper functions for text finding and position matching
 */

import { findTextWithFlexibleMatching } from './scripture-pill-position';

/** True when TipTap's ProseMirror view is mounted and usable. TipTap's `view` getter throws before mount. */
export function isTiptapViewReady(editorInstance: unknown): boolean {
  if (!editorInstance || typeof editorInstance !== 'object') return false;
  const ed = editorInstance as { isDestroyed?: boolean; view?: unknown };
  if (ed.isDestroyed) return false;
  try {
    const view = ed.view as { docView?: unknown } | null | undefined;
    return !!(view && view.docView);
  } catch {
    return false;
  }
}

/** Returns ProseMirror view when mounted; null pre-mount (never throws). Prefer over `editor.view` guards. */
export function getTiptapView(editorInstance: unknown): { docView?: unknown; dom?: HTMLElement } | null {
  if (!isTiptapViewReady(editorInstance)) return null;
  try {
    return (editorInstance as { view: { docView?: unknown; dom?: HTMLElement } }).view;
  } catch {
    return null;
  }
}

/** DOM id for scoping pending-pill maps. Safe before mount — never reads the throwing `view` getter unsafely. */
export function getTiptapEditorDomId(editorInstance: unknown, fallback = 'default'): string {
  if (!isTiptapViewReady(editorInstance)) return fallback;
  try {
    const view = (editorInstance as { view?: { dom?: { id?: string } } }).view;
    const id = view?.dom?.id;
    return id ? String(id) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Find text positions in a Tiptap editor document
 * @param editor - The Tiptap editor instance
 * @param searchText - The text to search for
 * @param skipMarked - If true, skip positions that already have noteLink or scripturePill marks
 * @returns Array of { from, to } position objects
 */
export function findTextPositionsInEditor(
  editor: any,
  searchText: string,
  skipMarked: boolean = true
): Array<{ from: number; to: number }> {
  if (!editor || !editor.state || !editor.state.doc) {
    return [];
  }

  const doc = editor.state.doc;
  const fullText = doc.textContent;
  
  if (!fullText || fullText.trim().length === 0 || !searchText || searchText.trim().length === 0) {
    return [];
  }
  
  // Normalize search text (trim whitespace)
  const normalizedSearchText = searchText.trim();
  
  // Find all matches with flexible spacing handling
  const matches = findTextWithFlexibleMatching(fullText, normalizedSearchText);
  
  if (matches.length === 0) {
    return [];
  }

  // Sort indices to process in order
  matches.sort((a, b) => a.index - b.index);
  
  const positions: Array<{ from: number; to: number }> = [];
  let currentPos = 0;
  
  // Build a map of text positions to document positions
  const textToDocMap: Array<{ textStart: number; textEnd: number; docStart: number }> = [];
  
  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (node.isText) {
      const text = node.text || '';
      const nodeStart = currentPos;
      const nodeEnd = currentPos + text.length;
      
      textToDocMap.push({
        textStart: nodeStart,
        textEnd: nodeEnd,
        docStart: pos
      });
      
      currentPos = nodeEnd;
    }
  });
  
  // For each match, find the corresponding document position
  for (const match of matches) {
    const searchIndex = match.index;
    const matchLength = match.length;
    
    // Find which text node contains this index
    for (const map of textToDocMap) {
      if (searchIndex >= map.textStart && searchIndex < map.textEnd) {
        const offset = searchIndex - map.textStart;
        const candidateFrom = map.docStart + offset;
        const candidateTo = candidateFrom + matchLength;
        
        // Check if this position already has a mark (noteLink or scripturePill)
        if (skipMarked) {
          try {
            const $from = doc.resolve(candidateFrom);
            const marks = $from.marks();
            const hasMark = marks.some((m: any) => 
              m.type.name === 'scripturePill' || m.type.name === 'noteLink'
            );
            if (hasMark) {
              // Skip this position
              continue;
            }
          } catch (e) {
            // If we can't resolve, skip it
            continue;
          }
        }
        
        // Check if this position overlaps with any already found position
        const overlaps = positions.some(p => 
          (candidateFrom >= p.from && candidateFrom < p.to) ||
          (candidateTo > p.from && candidateTo <= p.to) ||
          (candidateFrom <= p.from && candidateTo >= p.to)
        );
        
        if (!overlaps) {
          positions.push({ from: candidateFrom, to: candidateTo });
        }
        break;
      }
    }
  }
  
  return positions;
}

/**
 * Find the first unmarked text position in a Tiptap editor
 * @param editor - The Tiptap editor instance
 * @param searchText - The text to search for
 * @returns First matching position or null
 */
export function findFirstUnmarkedTextPosition(
  editor: any,
  searchText: string
): { from: number; to: number } | null {
  const positions = findTextPositionsInEditor(editor, searchText, true);
  return positions.length > 0 ? positions[0] : null;
}

/**
 * Wrap text in HTML content with a noteLink span
 * Finds the first occurrence of the text that isn't already wrapped in a noteLink
 * @param htmlContent - The HTML content string
 * @param searchText - The plain text to find and wrap
 * @param noteId - The note ID to link to
 * @returns Updated HTML content with the text wrapped, or null if text not found
 */
export function wrapTextWithNoteLink(
  htmlContent: string,
  searchText: string,
  noteId: string
): string | null {
  if (!htmlContent || !searchText || !noteId) {
    return null;
  }

  // Normalize search text: trim but preserve internal whitespace structure
  // We'll match with flexible whitespace but preserve the original when replacing
  const trimmedSearchText = searchText.trim();
  if (trimmedSearchText.length === 0) {
    return null;
  }

  // For matching, normalize whitespace (collapse multiple spaces/newlines to single space)
  // This allows us to find text even if whitespace differs slightly
  const normalizedSearchText = trimmedSearchText.replace(/\s+/g, ' ');

  // Escape special regex characters in the search text
  const escapedSearchText = normalizedSearchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create a regex pattern that matches the text, handling whitespace variations
  // This pattern allows for whitespace variations (multiple spaces, newlines, etc.)
  const searchPattern = new RegExp(escapedSearchText.replace(/\s+/g, '\\s+'), 'gi');

  // Opening tags like <span ...> — never inject markup inside attribute values
  const tagPattern = /<[^>]+>/g;
  const htmlTagRanges: Array<{ start: number; end: number }> = [];
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(htmlContent)) !== null) {
    htmlTagRanges.push({ start: tagMatch.index, end: tagMatch.index + tagMatch[0].length });
  }

  // Note-link and scripture-pill spans — do not wrap text inside them (avoids corrupting pills / double links)
  const noteLinkPattern = /<span[^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>[\s\S]*?<\/span>/gi;
  const scripturePillPattern = /<span[^>]*class\s*=\s*["'][^"']*scripture-pill[^"']*["'][^>]*>[\s\S]*?<\/span>/gi;
  const protectedSpanRanges: Array<{ start: number; end: number }> = [];
  let spanMatch: RegExpExecArray | null;
  while ((spanMatch = noteLinkPattern.exec(htmlContent)) !== null) {
    protectedSpanRanges.push({ start: spanMatch.index, end: spanMatch.index + spanMatch[0].length });
  }
  while ((spanMatch = scripturePillPattern.exec(htmlContent)) !== null) {
    protectedSpanRanges.push({ start: spanMatch.index, end: spanMatch.index + spanMatch[0].length });
  }

  const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
    !(aEnd <= bStart || bEnd <= aStart);

  const matchOverlapsProtectedRanges = (index: number, length: number): boolean => {
    const end = index + length;
    return protectedSpanRanges.some(r => rangesOverlap(index, end, r.start, r.end));
  };

  const matchOverlapsHtmlTags = (index: number, length: number): boolean => {
    const end = index + length;
    return htmlTagRanges.some(r => rangesOverlap(index, end, r.start, r.end));
  };

  // Find all matches of the search text in the HTML
  const matches: Array<{ match: string; index: number; length: number }> = [];
  let textMatch;
  // Reset regex lastIndex to ensure we search from the beginning
  searchPattern.lastIndex = 0;
  while ((textMatch = searchPattern.exec(htmlContent)) !== null) {
    matches.push({
      match: textMatch[0],
      index: textMatch.index,
      length: textMatch[0].length
    });
  }

  if (matches.length === 0) {
    return null;
  }

  // First match that is not inside an HTML tag (e.g. attribute value) or a protected span
  let validMatch: { match: string; index: number; length: number } | null = null;

  for (const match of matches) {
    if (matchOverlapsHtmlTags(match.index, match.length)) {
      continue;
    }
    if (matchOverlapsProtectedRanges(match.index, match.length)) {
      continue;
    }

    validMatch = match;
    break;
  }

  if (!validMatch) {
    return null;
  }

  // Extract the exact text that was matched (preserve original case and whitespace)
  const matchedText = htmlContent.substring(validMatch.index, validMatch.index + validMatch.length);
  
  // Create the note-link span HTML
  const noteLinkHtml = `<span class="note-link" data-note-id="${noteId}" style="background-color: rgba(255, 235, 59, 0.4); cursor: pointer;">${matchedText}</span>`;
  
  // Replace the matched text with the note-link span
  const updatedContent = 
    htmlContent.substring(0, validMatch.index) +
    noteLinkHtml +
    htmlContent.substring(validMatch.index + validMatch.length);

  return updatedContent;
}

/**
 * Strip note-link spans that point to a specific note ID from HTML content.
 * Used when a note is deleted so source notes no longer show the link/highlight.
 * Replaces each matching span with its inner text only.
 */
export function stripNoteLinksToNoteId(htmlContent: string, targetNoteId: string): string {
  if (!htmlContent || !targetNoteId) {
    return htmlContent;
  }
  const escaped = targetNoteId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match span that has data-note-id="targetNoteId" in opening tag; replace with inner text only
  const pattern = new RegExp(
    `<span[^>]*data-note-id\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)</span>`,
    'gi'
  );
  return htmlContent.replace(pattern, (_, inner) => (inner ?? ''));
}

