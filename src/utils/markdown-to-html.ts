import { marked } from 'marked';

/**
 * Converts Markdown content to HTML format
 * Compatible with Tiptap editor HTML format
 * @param markdown - Markdown string to convert
 * @returns HTML string
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim() === '') {
    return '';
  }

  try {
    // Configure marked options
    marked.setOptions({
      gfm: true, // GitHub Flavored Markdown
      breaks: false, // Don't convert line breaks to <br>
    });

    // Convert Markdown to HTML
    const html = marked.parse(markdown) as string;
    
    // Clean up extra whitespace
    const cleaned = html.replace(/\n{3,}/g, '\n\n').trim();
    
    return cleaned;
  } catch (error) {
    console.error('Error converting Markdown to HTML:', error);
    // Fallback: return as plain text wrapped in paragraph
    return `<p>${markdown.replace(/\n/g, '<br>')}</p>`;
  }
}

