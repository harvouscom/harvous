/**
 * Utility functions for working with Tiptap/ProseMirror editors
 * Shared helper functions for text finding and position matching
 */

/**
 * Normalize text for flexible matching (handles spacing variations)
 */
function normalizeTextForMatching(text: string): string {
  // Remove spaces around dashes and colons, normalize whitespace
  return text
    .replace(/\s*-\s*/g, '-')  // "16 - 17" -> "16-17"
    .replace(/:\s+/g, ':')     // "3: 16" -> "3:16"
    .replace(/\s+/g, ' ')      // Multiple spaces -> single space
    .trim()
    .toLowerCase();
}

/**
 * Find text positions with flexible matching for verse ranges
 */
function findTextWithFlexibleMatching(fullText: string, searchText: string): Array<{ index: number; length: number }> {
  const normalizedSearch = normalizeTextForMatching(searchText);
  const matches: Array<{ index: number; length: number }> = [];
  
  // Try exact match first
  let index = fullText.indexOf(searchText);
  while (index !== -1) {
    matches.push({ index, length: searchText.length });
    index = fullText.indexOf(searchText, index + 1);
  }
  
  // Also try normalized match (handles spacing variations)
  if (normalizedSearch !== searchText.toLowerCase()) {
    // Build regex pattern that matches with flexible spacing
    const escapedSearch = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow optional spaces around dashes and colons
    const flexiblePattern = escapedSearch
      .replace(/\s*-\s*/g, '\\s*-\\s*')  // Flexible dash spacing
      .replace(/:\s+/g, ':\\s*')         // Flexible colon spacing
      .replace(/\s+/g, '\\s+');          // Flexible general spacing
    
    const regex = new RegExp(flexiblePattern, 'gi');
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const matchIndex = match.index;
      const matchLength = match[0].length;
      // Avoid duplicates
      if (!matches.some(m => m.index === matchIndex)) {
        matches.push({ index: matchIndex, length: matchLength });
      }
    }
  }
  
  return matches;
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

  // Find all note-link spans and their positions to avoid matching text inside them
  const noteLinkPattern = /<span[^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>[\s\S]*?<\/span>/gi;
  const noteLinkRanges: Array<{ start: number; end: number }> = [];
  let noteLinkMatch;
  while ((noteLinkMatch = noteLinkPattern.exec(htmlContent)) !== null) {
    noteLinkRanges.push({
      start: noteLinkMatch.index,
      end: noteLinkMatch.index + noteLinkMatch[0].length
    });
  }

  // Helper function to check if a position is inside a note-link span
  const isInsideNoteLink = (position: number): boolean => {
    return noteLinkRanges.some(range => position >= range.start && position < range.end);
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

  // Find the first match that is NOT inside a note-link span
  // We allow matches inside scripture pills (they don't have class="note-link")
  let validMatch: { match: string; index: number; length: number } | null = null;
  
  for (const match of matches) {
    // Check if this match is inside a note-link span (using the range check)
    if (isInsideNoteLink(match.index)) {
      continue;
    }
    
    // Found a valid match - use it
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

