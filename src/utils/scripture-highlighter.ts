/**
 * Utility function to highlight scripture references in HTML content
 * Wraps scripture references with NoteLink spans for clickable links
 */

import { detectScriptureReferences } from './scripture-detector';

export interface ScriptureReference {
  reference: string;
  noteId: string;
}

/**
 * Strips note-link formatted scripture references from HTML content
 * These are legacy format spans that have class="note-link" and data-note-id but no data-scripture-reference
 * The text inside will be re-wrapped as proper scripture pills by highlightScriptureReferences
 * IMPORTANT: Only strips note-link spans that contain scripture references, preserves regular note links
 */
function stripNoteLinkScriptureSpans(content: string): string {
  let result = content;
  
  // Pattern 1: note-link spans - class comes after data-note-id
  const noteLinkPattern1 = /<span[^>]*data-note-id\s*=\s*["'][^"']+["'][^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  
  // Pattern 2: note-link spans - class comes before data-note-id
  const noteLinkPattern2 = /<span[^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*data-note-id\s*=\s*["'][^"']+["'][^>]*>([\s\S]*?)<\/span>/gi;
  
  // Collect all note-link spans
  const spans: Array<{ fullMatch: string; innerContent: string }> = [];
  
  let match;
  while ((match = noteLinkPattern1.exec(content)) !== null) {
    spans.push({ fullMatch: match[0], innerContent: match[1] });
  }
  while ((match = noteLinkPattern2.exec(content)) !== null) {
    // Check if not already matched by pattern 1
    if (!spans.some(s => s.fullMatch === match[0])) {
      spans.push({ fullMatch: match[0], innerContent: match[1] });
    }
  }
  
  // Only replace note-link spans that contain scripture references
  // This preserves regular note links (highlights) that don't contain scripture references
  for (const span of spans) {
    // Extract plain text from inner content (remove HTML tags)
    const plainText = span.innerContent.replace(/<[^>]*>/g, '').trim();
    
    // Check if this text contains a scripture reference
    const scriptureRefs = detectScriptureReferences(plainText);
    
    // Only strip if it contains a scripture reference
    if (scriptureRefs.length > 0) {
      result = result.replace(span.fullMatch, span.innerContent);
    }
    // Otherwise, preserve the note-link span (it's a regular highlight, not a scripture reference)
  }
  
  return result;
}

/**
 * Strips incomplete/broken scripture pill spans from HTML content
 * A broken pill is one that has data-scripture-reference but is missing data-note-id
 * This prevents nested spans when re-wrapping broken pills
 */
function stripBrokenPillSpans(content: string): string {
  // Find spans that have data-scripture-reference but NOT data-note-id
  // These are broken pills that need to be unwrapped
  // Use [\s\S]*? to match any content including nested HTML (non-greedy)
  const brokenPillPattern = /<span[^>]*data-scripture-reference\s*=\s*["'][^"']+["'][^>]*>([\s\S]*?)<\/span>/gi;
  
  let result = content;
  let match;
  
  // Find all potential broken pill spans
  const brokenSpans: Array<{ fullMatch: string; innerContent: string; hasNoteId: boolean }> = [];
  
  while ((match = brokenPillPattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const innerContent = match[1];
    // Check if this span also has data-note-id (if so, it's complete, not broken)
    const hasNoteId = fullMatch.includes('data-note-id');
    brokenSpans.push({ fullMatch, innerContent, hasNoteId });
  }
  
  // Replace broken spans (those without data-note-id) with just their inner content
  // Process in reverse order to preserve indices when replacing
  for (let i = brokenSpans.length - 1; i >= 0; i--) {
    const span = brokenSpans[i];
    if (!span.hasNoteId) {
      result = result.replace(span.fullMatch, span.innerContent);
    }
  }
  
  return result;
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

  // First, strip note-link formatted scripture spans (legacy format)
  // This converts <span class="note-link" data-note-id="...">John 3:16</span> to just "John 3:16"
  // so it can be re-wrapped as a proper scripture pill
  let updatedContent = stripNoteLinkScriptureSpans(content);

  // Then strip any broken/incomplete scripture pill spans to prevent nesting
  updatedContent = stripBrokenPillSpans(updatedContent);

  // Process each reference
  for (const { reference, noteId } of references) {
    // Escape special regex characters in the reference
    const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create regex pattern that matches the reference, allowing HTML tags between words
    // This handles cases like <em>John 3:16</em> or <i>John</i> 3:16
    // Split reference into tokens (words, numbers, punctuation, spaces)
    const tokens = escapedReference.match(/\S+|\s+/g) || [];
    const flexiblePattern = tokens.map(token => {
      if (/^\s+$/.test(token)) {
        // Whitespace: allow optional HTML tags around it
        return `\\s*(?:<[^>]+>)*\\s*`;
      } else {
        // Word/number/punctuation: allow optional HTML tags before and after
        // Use word boundary to prevent partial matches
        return `(?:<[^>]+>)*${token}(?:<[^>]+>)*`;
      }
    }).join('');
    
    const pattern = new RegExp(`(${flexiblePattern})`, 'gi');

    // Find all matches and their positions
    const matches: Array<{ match: string; index: number; cleanText: string }> = [];
    let match;
    while ((match = pattern.exec(updatedContent)) !== null) {
      // Extract the clean text (without HTML tags) for validation
      const cleanText = match[0].replace(/<[^>]+>/g, '').trim();
      // Only add if the clean text matches the reference (case-insensitive)
      if (cleanText.toLowerCase() === reference.toLowerCase()) {
        matches.push({
          match: match[0],
          index: match.index,
          cleanText: reference // Use original reference (always plain text, no formatting)
        });
      }
    }

    // Process matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const { match: matchText, index, cleanText } = matches[i];
      
      const beforeMatch = updatedContent.substring(0, index);
      const matchEnd = index + matchText.length;
      
      // Check if this match is inside a COMPLETE scripture pill (has BOTH required attributes)
      // Look backwards from the match to find the most recent unclosed span
      let searchPos = index;
      let foundCompletePillSpan = false;
      
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
        
        // Check if this is a COMPLETE scripture pill span with BOTH required attributes
        // A valid pill must have both data-scripture-reference AND data-note-id
        const hasScriptureRef = spanTag.includes('data-scripture-reference');
        const hasNoteId = spanTag.includes('data-note-id');
        const isCompletePillSpan = hasScriptureRef && hasNoteId;
        
        // Check if this span is closed before our match
        const spanCloseAfter = updatedContent.indexOf('</span>', spanTagEnd + 1);
        if (spanCloseAfter !== -1 && spanCloseAfter < index) {
          // This span is closed before our match, continue searching
          searchPos = lastSpanOpen - 1;
          continue;
        }
        
        // This span is not closed before our match
        if (isCompletePillSpan) {
          // Check if it closes after our match
          const spanCloseAfterMatch = updatedContent.indexOf('</span>', matchEnd);
          if (spanCloseAfterMatch !== -1) {
            foundCompletePillSpan = true;
            break;
          }
        }
        
        searchPos = lastSpanOpen - 1;
      }
      
      // Skip only if already inside a COMPLETE scripture pill (with both attributes)
      if (foundCompletePillSpan) {
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
      
      // Extract leading and trailing whitespace from the original match
      // matchText includes HTML tags, so we need to extract spaces from the text content
      const cleanMatchText = matchText.replace(/<[^>]+>/g, ''); // Remove HTML tags to get text
      const leadingSpaces = cleanMatchText.match(/^\s*/)?.[0] || '';
      const trailingSpaces = cleanMatchText.match(/\s*$/)?.[0] || '';
      
      // Wrap the match with scripture pill span format with inline styles
      // Always use cleanText (plain text, no formatting) for display inside the pill
      // This ensures scripture pills always have consistent standard text formatting
      // regardless of how the original reference was formatted (italicized, bolded, etc.)
      // font-style: normal prevents inheritance of italic formatting from parent elements
      // white-space: normal ensures line breaks after pills are preserved
      const wrapped = `<span data-scripture-reference="${cleanText}" data-note-id="${noteId}" class="scripture-pill scripture-pill-clickable" style="background-color: var(--color-paper); border-radius: 12px; padding: 0px 8px; display: inline-flex; align-items: baseline; height: auto; min-height: 28px; gap: 4px; box-shadow: 0px -3px 0px 0px inset rgba(176,176,176,0.25); font-weight: 600; font-style: normal; font-size: 16px; color: var(--color-deep-grey); vertical-align: baseline; line-height: 1.6; user-select: none; white-space: normal; cursor: pointer;">${cleanText}</span>`;
      
      // Preserve leading and trailing spaces outside the pill span
      updatedContent = updatedContent.substring(0, index) + leadingSpaces + wrapped + trailingSpaces + updatedContent.substring(index + matchText.length);
    }
  }

  return updatedContent;
}

