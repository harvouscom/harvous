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
      
      const beforeMatch = updatedContent.substring(0, index);
      const matchEnd = index + matchText.length;
      
      // Check if this match is inside a scripture pill
      // Look backwards from the match to find the most recent unclosed span
      let searchPos = index;
      let depth = 0;
      let foundPillSpan = false;
      
      while (searchPos > 0) {
        const lastSpanOpen = beforeMatch.lastIndexOf('<span', searchPos - 1);
        if (lastSpanOpen === -1) break;
        
        // Get the span tag
        const spanTagEnd = updatedContent.indexOf('>', lastSpanOpen);
        if (spanTagEnd === -1 || spanTagEnd >= index) {
          searchPos = lastSpanOpen - 1;
          continue;
        }
        
        const spanTag = updatedContent.substring(lastSpanOpen, spanTagEnd + 1);
        
        // Check if this is a scripture pill span
        const isPillSpan = spanTag.includes('data-scripture-reference') || 
                          spanTag.includes('scripture-pill') || 
                          spanTag.includes('class="scripture-pill') ||
                          spanTag.includes("class='scripture-pill");
        
        // Check if this span is closed before our match
        const spanCloseAfter = updatedContent.indexOf('</span>', spanTagEnd + 1);
        if (spanCloseAfter !== -1 && spanCloseAfter < index) {
          // This span is closed before our match, continue searching
          searchPos = lastSpanOpen - 1;
          continue;
        }
        
        // This span is not closed before our match
        if (isPillSpan) {
          // Check if it closes after our match
          const spanCloseAfterMatch = updatedContent.indexOf('</span>', matchEnd);
          if (spanCloseAfterMatch !== -1) {
            foundPillSpan = true;
            break;
          }
        }
        
        searchPos = lastSpanOpen - 1;
      }
      
      // Skip if already inside a scripture pill
      if (foundPillSpan) {
        continue;
      }
      
      // Check if this match is already inside a note-link span
      const openSpansBefore = (beforeMatch.match(/<span[^>]*class="note-link"[^>]*>/gi) || []).length;
      const closeSpansBefore = (beforeMatch.match(/<\/span>/gi) || []).length;
      
      // If we're inside a note-link span, don't wrap again
      if (openSpansBefore > closeSpansBefore) {
        continue;
      }
      
      // Check if this exact match is already wrapped (look for data-note-id attribute nearby)
      const contextBefore = beforeMatch.substring(Math.max(0, beforeMatch.length - 100));
      const contextAfter = updatedContent.substring(matchEnd, Math.min(matchEnd + 100, updatedContent.length));
      const fullContext = contextBefore + matchText + contextAfter;
      
      // If we see a note-link span or scripture pill with this noteId nearby, skip wrapping
      if (fullContext.includes(`data-note-id="${noteId}"`)) {
        continue;
      }
      
      // Wrap the match with scripture pill span format with inline styles
      // This ensures proper rendering both in Tiptap and when displayed via dangerouslySetInnerHTML
      const wrapped = `<span data-scripture-reference="${matchText}" data-note-id="${noteId}" class="scripture-pill scripture-pill-clickable" style="background-color: var(--color-paper); border-radius: 4px; padding: 0px 8px 0px 6px; display: inline-flex; align-items: baseline; height: auto; min-height: 28px; gap: 6px; box-shadow: 0px -3px 0px 0px inset rgba(176,176,176,0.25); font-weight: 600; font-size: 16px; color: var(--color-deep-grey); vertical-align: baseline; line-height: 1.6; user-select: none; cursor: pointer;">${matchText}</span>`;
      updatedContent = updatedContent.substring(0, index) + wrapped + updatedContent.substring(index + matchText.length);
    }
  }

  return updatedContent;
}

