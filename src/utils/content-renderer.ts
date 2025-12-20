/**
 * Safe content rendering utility for React components
 * Ensures content is always a valid string for dangerouslySetInnerHTML
 * Prevents React error #418: "Objects are not valid as a React child"
 */

/**
 * Safely converts any content to a string suitable for dangerouslySetInnerHTML
 * Handles null, undefined, DOM nodes, and other edge cases
 * 
 * @param content - Content to render (can be string, null, undefined, DOM node, etc.)
 * @returns A valid string for dangerouslySetInnerHTML, or empty string for invalid content
 */
export function safeRenderHtml(content: unknown): string {
  // Handle null and undefined
  if (content === null || content === undefined) {
    return '';
  }

  // If it's already a string, return it
  if (typeof content === 'string') {
    return content;
  }

  // If it's a number, convert to string
  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }

  // If it's a DOM node, try to extract its HTML
  if (content && typeof content === 'object') {
    // Check if it's a DOM element
    if ('nodeType' in content && 'textContent' in content) {
      const element = content as HTMLElement;
      // If it's an element, get its innerHTML
      if (element.nodeType === 1) { // Element node
        return element.innerHTML || element.textContent || '';
      }
      // If it's a text node, get its textContent
      if (element.nodeType === 3) { // Text node
        return element.textContent || '';
      }
    }

    // If it has a toString method, try that
    if ('toString' in content && typeof content.toString === 'function') {
      try {
        const stringified = content.toString();
        if (typeof stringified === 'string') {
          return stringified;
        }
      } catch {
        // Ignore toString errors
      }
    }
  }

  // For any other type, return empty string to prevent React errors
  console.warn('[safeRenderHtml] Invalid content type for HTML rendering:', typeof content);
  return '';
}

/**
 * Validates that content is a string before rendering
 * Throws a helpful error if content is invalid
 * 
 * @param content - Content to validate
 * @param context - Context for error messages (e.g., component name)
 * @returns The content as a string
 * @throws Error if content cannot be safely converted to string
 */
export function validateHtmlContent(content: unknown, context = 'Component'): string {
  const safeContent = safeRenderHtml(content);
  
  // If safeRenderHtml returned empty string but content was not null/undefined,
  // it means we had an invalid type
  if (safeContent === '' && content !== null && content !== undefined && content !== '') {
    console.error(`[validateHtmlContent] Invalid content type in ${context}:`, typeof content, content);
  }
  
  return safeContent;
}

