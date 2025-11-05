import TurndownService from 'turndown';

// Initialize Turndown service with options
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

/**
 * Converts HTML content to Markdown format
 * @param html - HTML string to convert
 * @returns Markdown string
 */
export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === '') {
    return '';
  }

  try {
    // Convert HTML to Markdown
    let markdown = turndownService.turndown(html);
    
    // Clean up extra whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    return markdown.trim();
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    // Fallback: strip HTML tags
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

/**
 * Converts HTML content to plain text (server-safe)
 * @param html - HTML string to convert
 * @returns Plain text string
 */
export function htmlToPlainText(html: string): string {
  if (!html || html.trim() === '') {
    return '';
  }

  try {
    // Server-safe: strip HTML tags and decode entities
    let text = html
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&lt;/g, '<') // Replace &lt;
      .replace(/&gt;/g, '>') // Replace &gt;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/&#39;/g, "'") // Replace &#39;
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return text;
  } catch (error) {
    console.error('Error converting HTML to plain text:', error);
    // Fallback: strip HTML tags
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

