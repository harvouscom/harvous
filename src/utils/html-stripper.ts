/**
 * HTML Stripping Utility
 * 
 * Unified implementation for stripping HTML tags and extracting plain text.
 * Supports multiple modes for different use cases.
 */

import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { matchAnchoredTrailingTranslationAbbreviation } from '@/utils/scripture-detector';
import { repairScripturePillTranslationsInHtml } from '@/utils/scripture-pill-display';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';

export interface StripHtmlOptions {
  /**
   * Preserve spacing between block elements (p, div, h1-h6, li, etc.)
   * Used for CardNote components where spacing is critical
   */
  preserveSpacing?: boolean;
  
  /**
   * Use DOM API for parsing (client-side only)
   * More accurate but requires browser environment
   */
  useDOM?: boolean;
  
  /**
   * Maximum length for preview text (truncates with ellipsis)
   */
  maxLength?: number;
}

const SCRIPTURE_PILL_SPAN_RE = /<span[^>]*data-scripture-reference[^>]*>([\s\S]*?)<\/span>/gi;

function shouldAdoptTranslationOnPill(current: string | null): boolean {
  if (!current) return true;
  if (current === 'NET') return true;
  return false;
}

function resolveScripturePillPlainText(
  fullSpan: string,
  refContent: string,
  afterSpanHtml: string,
): { plain: string; skipAfter: number } {
  const attrMatch = fullSpan.match(/data-scripture-translation\s*=\s*["']([^"']+)["']/i);
  const current = attrMatch?.[1]?.trim() ?? null;
  const refText = refContent.trim();

  const textBeforeNextTag = afterSpanHtml.match(/^([^<]*)/)?.[1] ?? '';
  const trailing = matchAnchoredTrailingTranslationAbbreviation(textBeforeNextTag);

  let effectiveId = current ?? 'NET';
  let skipAfter = 0;

  if (trailing) {
    if (shouldAdoptTranslationOnPill(current) || current === trailing.canonicalId) {
      if (shouldAdoptTranslationOnPill(current)) {
        effectiveId = trailing.canonicalId;
      }
      skipAfter = trailing.consumed.length;
    }
  }

  const abbrev = getTranslationAbbreviationDisplay(effectiveId) || effectiveId;
  return { plain: `${refText} ${abbrev}`, skipAfter };
}

/** Collapse scripture pill spans to plain text before tag stripping (mirrors editor repair for previews). */
function collapseScripturePillsForPlainText(html: string): string {
  if (!html.includes('data-scripture-reference')) return html;

  const pillRe = new RegExp(SCRIPTURE_PILL_SPAN_RE.source, 'gi');
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = pillRe.exec(html)) !== null) {
    out += html.slice(cursor, m.index);
    const fullSpan = m[0];
    const refContent = m[1];
    const afterSpan = html.slice(m.index + fullSpan.length);
    const { plain, skipAfter } = resolveScripturePillPlainText(fullSpan, refContent, afterSpan);
    if (out.length > 0 && plain.length > 0 && !/\s$/.test(out) && !/^\s/.test(plain)) {
      out += ' ';
    }
    out += plain;
    cursor = m.index + fullSpan.length + skipAfter;
  }
  out += html.slice(cursor);
  return out;
}

/**
 * Space out `<sup>`/`<sub>` before the tags are thrown away.
 *
 * Verse text arrives as `<sup class="verse-num">16</sup>For God so loved…` — correct while it
 * is HTML, because CSS puts the gap in. Flattened to plain text it became "16For God so loved",
 * and there is a live path that does exactly that: `passagePlainTextFromVerseHtml` rewrites a
 * scripture quote's body whenever its pill's reference, translation or accent changes. So a
 * quote read correctly when it was inserted and turned conjoined later, which is why only
 * *some* of them were wrong.
 *
 * `<span>` and the block tags are already padded this way; superscripts were simply missed.
 * Deliberately not a blanket tags-to-spaces change: that would split `un<b>der</b>stand` into
 * two words. Only tags that stand between genuinely separate pieces of text get a space.
 */
function padSupSub(text: string): string {
  return text
    .replace(/([^\s>])(<(?:sup|sub)[^>]*>)/gi, '$1 $2')
    .replace(/(<\/(?:sup|sub)>)([^\s<])/gi, '$1 $2');
}

/**
 * Main HTML stripping function
 * 
 * @param html - HTML string to strip
 * @param options - Stripping options
 * @returns Plain text with HTML removed
 */
export function stripHtml(html: string, options: StripHtmlOptions = {}): string {
  if (!html) return '';
  
  const { preserveSpacing = false, useDOM = false, maxLength } = options;
  let text = html.includes('data-scripture-reference') ? collapseScripturePillsForPlainText(html) : html;
  
  // Client-side DOM parsing (most accurate, preserves spacing)
  if (useDOM && typeof document !== 'undefined') {
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = text;
      
      // Block-level elements that should have spaces between them
      const blockElements = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'];
      
      // Walk the DOM tree and collect text with proper spacing
      function extractTextWithSpacing(node: Node): string {
        let result = '';
        
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          const prevSibling = i > 0 ? node.childNodes[i - 1] : null;
          const nextSibling = i < node.childNodes.length - 1 ? node.childNodes[i + 1] : null;
          
          if (child.nodeType === Node.TEXT_NODE) {
            // Add text content, converting line breaks to spaces
            const text = (child.textContent || '').replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
            result += text;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const element = child as Element;
            const tagName = element.tagName;
            const isBlockElement = blockElements.includes(tagName);
            
            // Add space before block elements if previous sibling was also a block element
            if (isBlockElement && prevSibling && prevSibling.nodeType === Node.ELEMENT_NODE) {
              const prevTagName = (prevSibling as Element).tagName;
              if (blockElements.includes(prevTagName)) {
                result += ' ';
              }
            }
            
            // Handle specific elements
            if (tagName === 'BR') {
              result += ' ';
            } else if (tagName === 'LI') {
              result += '• ';
              result += extractTextWithSpacing(child);
            } else {
              // For inline elements (like SPAN), extract text and ALWAYS add spaces around it
              const childText = extractTextWithSpacing(child);
              
              if (!isBlockElement && childText.trim().length > 0) {
                // ALWAYS add space before inline elements to prevent text running together
                if (prevSibling) {
                  if (prevSibling.nodeType === Node.TEXT_NODE) {
                    const prevText = (prevSibling.textContent || '').trim();
                    if (prevText.length > 0) {
                      result += ' ';
                    }
                  } else if (prevSibling.nodeType === Node.ELEMENT_NODE) {
                    result += ' ';
                  }
                }
                
                result += childText.trim();
                
                // ALWAYS add space after inline elements to prevent text running together
                if (nextSibling) {
                  if (nextSibling.nodeType === Node.TEXT_NODE) {
                    const nextText = (nextSibling.textContent || '').trim();
                    if (nextText.length > 0) {
                      result += ' ';
                    }
                  } else if (nextSibling.nodeType === Node.ELEMENT_NODE) {
                    result += ' ';
                  }
                }
              } else {
                // For block elements, just recursively process
                result += childText;
                
                // Add space after block elements to ensure separation
                if (isBlockElement) {
                  result += ' ';
                }
              }
            }
          }
        }
        
        return result;
      }
      
      let text = extractTextWithSpacing(tempDiv);
      
      // Convert all remaining line breaks to spaces (in case any were missed)
      text = text.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ');
      
      // Clean up multiple spaces and trim
      text = text.replace(/\s+/g, ' ').trim();
      
      // Apply max length if specified
      if (maxLength && text.length > maxLength) {
        return text.substring(0, maxLength) + '...';
      }
      
      return text;
    } catch (error) {
      // Fall through to regex-based approach if DOM parsing fails
      console.warn('DOM-based HTML stripping failed, falling back to regex:', error);
    }
  }
  
  // Regex-based approach (works in both server and client)
  // Remove script and style tags completely (including their content)
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  if (preserveSpacing) {
    // Complex spacing-preserving logic (for CardNote.astro variant)
    // CRITICAL: Convert line breaks to spaces FIRST - before any other processing
    text = text.replace(/\r\n/g, ' ');
    text = text.replace(/\n/g, ' ');
    text = text.replace(/\r/g, ' ');
    
    // Convert br tags to spaces
    text = text.replace(/<br\s*\/?>/gi, ' ');
    
    // CRITICAL: Ensure spaces around spans BEFORE extracting them
    // Add space before opening span if preceded by non-whitespace
    text = text.replace(/([^\s>])(<span[^>]*>)/gi, '$1 $2');
    // Add space after closing span if followed by non-whitespace
    text = text.replace(/(<\/span>)([^\s<])/gi, '$1 $2');

    // Same for <sup>/<sub>, which is where verse numbers live.
    text = padSupSub(text);
    
    // Now extract text from inline spans, ensuring spaces are preserved
    text = text.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, (_match, content) => {
      const trimmedContent = content.trim();
      if (trimmedContent) {
        return ` ${trimmedContent} `;
      }
      return ' ';
    });
    
    // CRITICAL: Insert space between adjacent closing and opening block tags
    text = text.replace(/(<\/p>)(<p[^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/p>)(<div[^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/div>)(<p[^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/div>)(<div[^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/h[1-6]>)(<p[^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/h[1-6]>)(<div[^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/p>)(<h[1-6][^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/div>)(<h[1-6][^>]*>)/gi, '$1 $2');
    text = text.replace(/(<\/li>)(<li[^>]*>)/gi, '$1 $2');
    
    // Convert block-level closing tags to placeholder (preserves word boundaries)
    text = text.replace(/<\/p>/gi, ' __SPACE__ ');
    text = text.replace(/<\/div>/gi, ' __SPACE__ ');
    text = text.replace(/<\/li>/gi, ' __SPACE__ ');
    text = text.replace(/<\/h[1-6]>/gi, ' __SPACE__ ');
    
    // Convert ordered lists to numbered format
    text = text.replace(/<ol[^>]*>/gi, '');
    text = text.replace(/<\/ol>/gi, ' __SPACE__ ');
    text = text.replace(/<li[^>]*>/gi, '• ');
    
    // Convert unordered lists to bullet format
    text = text.replace(/<ul[^>]*>/gi, '');
    text = text.replace(/<\/ul>/gi, ' __SPACE__ ');
    
    // Remove opening tags (after we've handled line breaks)
    text = text.replace(/<p[^>]*>/gi, '');
    text = text.replace(/<div[^>]*>/gi, '');
    text = text.replace(/<h[1-6][^>]*>/gi, '');
    
    // Remove remaining HTML tags
    text = text.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&#x27;/g, "'");
    text = text.replace(/&#x2F;/g, '/');
    text = text.replace(/&#x60;/g, '`');
    text = text.replace(/&#x3D;/g, '=');
    
    // Replace placeholder with actual space (ensure it's always a space)
    text = text.replace(/__SPACE__/g, ' ');
    
    // Clean up multiple spaces to single space
    text = text.replace(/\s+/g, ' ');
    text = text.trim();
  } else {
    // Simple regex-based stripping (for most use cases)
    text = padSupSub(text);
    // Remove all HTML tags
    text = text.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&#x27;/g, "'");
    text = text.replace(/&#x2F;/g, '/');
    text = text.replace(/&#x60;/g, '`');
    text = text.replace(/&#x3D;/g, '=');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.trim();
  }
  
  // Apply max length if specified
  if (maxLength && text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  
  return text;
}

/**
 * Convenience function for preview text (simple stripping with max length)
 */
export function stripHtmlForPreview(html: string, maxLength: number = 150): string {
  return stripHtml(html, { maxLength });
}

/** Block/line boundaries in note HTML before per-segment stripping. */
function markHtmlBlockBoundaries(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<(?:p|div|h[1-6]|li)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
}

function listPreviewSegmentsFromHtml(html: string): string[] {
  const marked = markHtmlBlockBoundaries(html);
  const segments: string[] = [];
  for (const chunk of marked.split('\n')) {
    const piece = stripHtml(chunk, { preserveSpacing: true }).trim();
    if (piece) segments.push(piece);
  }
  if (segments.length > 0) return segments;
  const fallback = stripHtml(html, { preserveSpacing: true }).trim();
  return fallback ? [fallback] : [];
}

/** LEFT(content) truncation can split a pill mid-tag; collapse only when the tail is incomplete. */
function repairTruncatedHtmlForListPreview(html: string): string {
  if (!html.includes('data-scripture-reference') || !/<[^>]*$/.test(html)) return html;
  let s = html;
  const partialRef = s.match(/data-scripture-reference\s*=\s*["']([^"'>]*)/i)?.[1]?.trim();
  if (partialRef) {
    s = s.replace(/<span\b[\s\S]*$/i, `${partialRef} `);
  }
  s = s.replace(/<[^>]*$/g, '');
  s = s.replace(/<p\b[^>]*$/gi, '');
  return s;
}

/**
 * One-line note list preview: skips empty filler blocks, joins lines with a space,
 * and keeps adding lines until `maxLength` (or runs out of content).
 */
export function stripHtmlForListPreview(html: string, maxLength: number = 80): string {
  if (!html) return '';
  let normalized = repairTruncatedHtmlForListPreview(html);
  if (typeof document !== 'undefined' && normalized.includes('data-scripture-reference')) {
    normalized = repairScripturePillTranslationsInHtml(normalized, getEffectiveDefaultTranslation());
  }
  const segments = listPreviewSegmentsFromHtml(normalized);
  let out = '';
  for (const segment of segments) {
    const next = out ? `${out} ${segment}` : segment;
    if (next.length > maxLength) {
      if (!out) return segment.length > maxLength ? `${segment.slice(0, maxLength)}…` : segment;
      break;
    }
    out = next;
  }
  return out;
}

/**
 * Convenience function for CardNote components (preserves spacing)
 */
export function stripHtmlForCard(html: string, useDOM: boolean = false): string {
  return stripHtml(html, { preserveSpacing: true, useDOM });
}

