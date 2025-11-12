/**
 * Utility function to highlight scripture references in HTML content
 * Wraps scripture references with NoteLink spans for clickable links
 */

export interface ScriptureReference {
  reference: string;
  noteId: string;
}

/**
 * Highlights scripture references in HTML content by wrapping them with NoteLink spans
 * @param content - HTML content string
 * @param references - Array of scripture references with their corresponding note IDs
 * @returns Updated HTML content with highlighted scripture references
 */
export function highlightScriptureReferences(
  content: string,
  references: ScriptureReference[]
): string {
  if (!content || references.length === 0) {
    return content;
  }

  let updatedContent = content;

  // Process each reference
  for (const { reference, noteId } of references) {
    // Escape special regex characters in the reference
    const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create regex pattern that matches the reference
    // Make whitespace flexible to handle HTML formatting
    const pattern = new RegExp(
      `(${escapedReference.replace(/\s+/g, '\\s+')})`,
      'gi'
    );

    // Find all matches and their positions
    const matches: Array<{ match: string; index: number }> = [];
    let match;
    while ((match = pattern.exec(updatedContent)) !== null) {
      matches.push({
        match: match[0],
        index: match.index
      });
    }

    // Process matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const { match: matchText, index } = matches[i];
      
      // Check if this match is already inside a note-link span
      const beforeMatch = updatedContent.substring(0, index);
      const afterMatch = updatedContent.substring(index + matchText.length);
      
      // Count open and close note-link spans before this match
      const openSpansBefore = (beforeMatch.match(/<span[^>]*class="note-link"[^>]*>/gi) || []).length;
      const closeSpansBefore = (beforeMatch.match(/<\/span>/gi) || []).length;
      
      // If we're inside a note-link span, don't wrap again
      if (openSpansBefore > closeSpansBefore) {
        continue;
      }
      
      // Check if this exact match is already wrapped (look for data-note-id attribute nearby)
      const contextBefore = beforeMatch.substring(Math.max(0, beforeMatch.length - 100));
      const contextAfter = afterMatch.substring(0, 100);
      const fullContext = contextBefore + matchText + contextAfter;
      
      // If we see a note-link span with this noteId nearby, skip wrapping
      if (fullContext.includes(`data-note-id="${noteId}"`)) {
        continue;
      }
      
      // Wrap the match with note-link span
      const wrapped = `<span class="note-link" data-note-id="${noteId}" style="background-color: rgba(255, 235, 59, 0.4); cursor: pointer;">${matchText}</span>`;
      updatedContent = updatedContent.substring(0, index) + wrapped + updatedContent.substring(index + matchText.length);
    }
  }

  return updatedContent;
}

