/**
 * Content extraction utility using @extractus/article-extractor (primary) and Mozilla Readability (fallback)
 * Extracts main article content from web pages, removing ads, navigation, etc.
 * Outputs clean text wrapped in paragraphs - no images, videos, or complex HTML
 */

import { extract } from '@extractus/article-extractor';
// @ts-ignore - linkedom types conflict with native DOM types
import { Readability } from '@mozilla/readability';
// @ts-ignore - linkedom types conflict with native DOM types
import { parseHTML } from 'linkedom';

/**
 * Convert HTML to clean formatted content
 * Preserves headings, paragraphs, lists, and blockquotes
 * Expands accordions (details/summary) - displays summary as heading and all content expanded
 * Removes images, videos, and other media
 */
function htmlToCleanParagraphs(html: string): string {
  // Parse HTML to extract text properly
  const { document } = parseHTML(`<div>${html}</div>`);
  const root = document.querySelector('div');
  if (!root) return '';
  
  const output: string[] = [];
  
  // Recursive function to extract text from nodes (for inline content)
  function extractText(node: any): string {
    if (!node) return '';
    
    // Text node
    if (node.nodeType === 3) {
      return node.textContent || '';
    }
    
    const tagName = node.tagName?.toLowerCase() || '';
    
    // Skip these elements entirely
    if (['script', 'style', 'noscript', 'svg', 'canvas', 'video', 'audio', 'iframe', 'img', 'picture', 'figure'].includes(tagName)) {
      return '';
    }
    
    // Preserve line breaks
    if (tagName === 'br') {
      return '<br>';
    }
    
    // Handle inline formatting
    let text = '';
    for (const child of node.childNodes || []) {
      text += extractText(child);
    }
    
    // Preserve bold/italic
    if (tagName === 'strong' || tagName === 'b') {
      return `<strong>${text}</strong>`;
    }
    if (tagName === 'em' || tagName === 'i') {
      return `<em>${text}</em>`;
    }
    
    return text;
  }
  
  // Check if text looks like media metadata or video caption
  function isMediaMetadata(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return (
      // Common prefixes
      lower.startsWith('image:') || 
      lower.startsWith('photo:') ||
      lower.startsWith('video:') ||
      lower.startsWith('credit:') ||
      lower.startsWith('source:') ||
      lower.startsWith('watch:') ||
      lower.startsWith('listen:') ||
      // Dimensions like "1920x1080"
      /^\d+x\d+/.test(lower) ||
      // File extensions
      /^(jpg|jpeg|png|gif|webp|mp4|mov|avi)/i.test(lower) ||
      // Timestamps like "5:19" or "1:23:45"
      /^\d{1,2}:\d{2}(:\d{2})?$/.test(lower) ||
      // Common video/media caption patterns
      lower === 'play' ||
      lower === 'pause' ||
      lower === 'mute' ||
      lower === 'unmute' ||
      lower.includes('transcript') ||
      lower.includes('download') ||
      // If it's just "intro to X" or "episode X" by itself, likely a video title
      /^(intro|episode|part|chapter)\s+(to\s+)?\w/i.test(lower) && lower.length < 60
    );
  }
  
  // Check if an element is inside a media caption container (semantic-first approach)
  function isInsideMediaCaption(node: any): boolean {
    let current = node;
    let depth = 0;
    while (current && depth < 10) {
      const tagName = current.tagName?.toLowerCase() || '';
      
      // Semantic HTML: figcaption is THE caption element
      if (tagName === 'figcaption') {
        return true;
      }
      
      // Check if inside a figure that contains media
      if (tagName === 'figure') {
        const hasMedia = current.querySelector?.('video, audio, img, picture, iframe');
        if (hasMedia) return true;
      }
      
      // Fallback: check common class/id patterns for non-semantic sites
      const id = (current.id || '').toLowerCase();
      const className = (current.className || '').toLowerCase();
      if (
        id.includes('caption') ||
        className.includes('caption')
      ) {
        return true;
      }
      
      current = current.parentElement;
      depth++;
    }
    return false;
  }
  
  // Check if an element is a sibling of media elements AND looks like a caption/credit
  // (Some sites structure real article text as siblings of media; don't skip those.)
  function isSiblingOfMedia(node: any): boolean {
    const parent = node.parentElement;
    if (!parent) return false;
    
    // Check if any sibling is a media element
    let hasMediaSibling = false;
    for (const sibling of parent.children || []) {
      if (sibling === node) continue;
      const tag = sibling.tagName?.toLowerCase();
      if (['video', 'audio', 'img', 'picture', 'iframe', 'canvas'].includes(tag)) {
        hasMediaSibling = true;
        break;
      }
    }

    if (!hasMediaSibling) return false;

    const tagName = node.tagName?.toLowerCase() || '';
    const id = (node.id || '').toLowerCase();
    const className = (node.className || '').toLowerCase();

    // Only treat as caption if it advertises itself as one
    const looksCaptiony =
      tagName === 'figcaption' ||
      id.includes('caption') ||
      className.includes('caption') ||
      id.includes('credit') ||
      className.includes('credit') ||
      id.includes('source') ||
      className.includes('source');

    return looksCaptiony;
  }
  
  // Process block-level elements
  function processBlock(node: any): void {
    if (!node) return;
    
    const tagName = node.tagName?.toLowerCase() || '';
    
    // Skip media elements entirely (semantic HTML)
    if (['script', 'style', 'noscript', 'svg', 'canvas', 'video', 'audio', 'iframe', 'img', 'picture', 'figure', 'figcaption'].includes(tagName)) {
      return;
    }
    
    // Skip if this element is inside a media caption (semantic: figcaption, figure with media)
    if (isInsideMediaCaption(node)) {
      return;
    }
    
    // Skip if this element is a sibling of media AND is labeled like a caption/credit
    if (isSiblingOfMedia(node)) {
      // Only skip if it's short text (actual captions are usually brief)
      const textContent = (node.textContent || '').trim();
      if (textContent.length < 200) {
        return;
      }
    }
    
    // Handle callouts specially - preserve internal structure
    if (isCalloutElement(node) || tagName === 'aside') {
      const calloutContent = processCallout(node, extractText, isMediaMetadata);
      if (calloutContent.length > 0) {
        // Wrap all callout content in a blockquote
        output.push(`<blockquote>\n${calloutContent.join('\n')}\n</blockquote>`);
      }
      return;
    }
    
    // Handle headings - preserve them
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = extractText(node).replace(/\s+/g, ' ').trim();
      if (text && !isMediaMetadata(text)) {
        output.push(`<${tagName}>${text}</${tagName}>`);
      }
      return;
    }
    
    // Handle lists
    if (tagName === 'ul' || tagName === 'ol') {
      const listItems: string[] = [];
      for (const child of node.childNodes || []) {
        if (child.tagName?.toLowerCase() === 'li') {
          const text = extractText(child).replace(/\s+/g, ' ').trim();
          if (text && !isMediaMetadata(text)) {
            listItems.push(`<li>${text}</li>`);
          }
        }
      }
      if (listItems.length > 0) {
        output.push(`<${tagName}>${listItems.join('')}</${tagName}>`);
      }
      return;
    }
    
    // Handle blockquotes (but not callouts which were handled above)
    if (tagName === 'blockquote') {
      const text = extractText(node).replace(/\s+/g, ' ').trim();
      if (text && !isMediaMetadata(text)) {
        output.push(`<blockquote>${text}</blockquote>`);
      }
      return;
    }
    
    // Handle details/accordion elements - expand content instead of preserving structure
    if (tagName === 'details') {
      expandDetailsContent(node, extractText, isMediaMetadata);
      return;
    }
    
    // Handle paragraphs and divs
    if (tagName === 'p' || tagName === 'div') {
      // Check if this is a callout-classed div
      if (isCalloutElement(node)) {
        const calloutContent = processCallout(node, extractText, isMediaMetadata);
        if (calloutContent.length > 0) {
          output.push(`<blockquote>\n${calloutContent.join('\n')}\n</blockquote>`);
        }
        return;
      }
      
      // Check if this div contains block elements (don't process as paragraph)
      const hasBlockChildren = Array.from(node.childNodes || []).some((child: any) => {
        const childTag = child.tagName?.toLowerCase();
        return ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'aside', 'details'].includes(childTag);
      });
      
      if (hasBlockChildren) {
        // Process children instead
        for (const child of node.childNodes || []) {
          if (child.nodeType === 1) {
            processBlock(child);
          }
        }
      } else {
        const text = extractText(node).replace(/\s+/g, ' ').trim();
        if (text && !isMediaMetadata(text)) {
          output.push(`<p>${text}</p>`);
        }
      }
      return;
    }
    
    // For other container elements (section, article), process children
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        processBlock(child);
      } else if (child.nodeType === 3) {
        // Handle direct text nodes (not wrapped in p tags)
        const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && text.length > 20 && !isMediaMetadata(text)) {
          output.push(`<p>${text}</p>`);
        }
      }
    }
  }
  
  // Process all top-level children
  for (const child of root.childNodes || []) {
    if (child.nodeType === 1) {
      processBlock(child);
    } else if (child.nodeType === 3) {
      // Handle direct text nodes (not wrapped in p tags)
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && text.length > 20 && !isMediaMetadata(text)) {
        output.push(`<p>${text}</p>`);
      }
    }
  }
  
  // Remove duplicates while preserving order
  const seen = new Set<string>();
  const uniqueOutput = output.filter(item => {
    // Normalize for comparison
    const normalized = item.replace(/<[^>]+>/g, '').trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  
  return uniqueOutput.join('\n');
}

/**
 * Check if an element is a callout based on tag name or class
 */
function isCalloutElement(node: any): boolean {
  const tagName = node.tagName?.toLowerCase() || '';
  const className = (node.className || '').toLowerCase();
  
  // Check tag
  if (tagName === 'aside') return true;
  
  // Check class patterns
  const calloutPatterns = ['callout', 'highlight', 'featured', 'big-idea', 'key-point', 'pull-quote', 'note-box', 'info-box'];
  return calloutPatterns.some(pattern => className.includes(pattern));
}

/**
 * Process a callout element, preserving internal structure
 */
function processCallout(node: any, extractText: (n: any) => string, isMediaMetadata: (t: string) => boolean): string[] {
  const output: string[] = [];
  
  function processCalloutChild(child: any): void {
    if (!child) return;
    
    const tagName = child.tagName?.toLowerCase() || '';
    
    // Skip media
    if (['script', 'style', 'noscript', 'svg', 'canvas', 'video', 'audio', 'iframe', 'img', 'picture', 'figure', 'figcaption'].includes(tagName)) {
      return;
    }
    
    // Handle headings inside callout
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = extractText(child).replace(/\s+/g, ' ').trim();
      if (text && !isMediaMetadata(text)) {
        // Use h4 for callout headings to differentiate from main content
        output.push(`<h4>${text}</h4>`);
      }
      return;
    }
    
    // Handle paragraphs
    if (tagName === 'p') {
      const text = extractText(child).replace(/\s+/g, ' ').trim();
      if (text && !isMediaMetadata(text)) {
        output.push(`<p>${text}</p>`);
      }
      return;
    }
    
    // Handle lists
    if (tagName === 'ul' || tagName === 'ol') {
      const listItems: string[] = [];
      for (const li of child.childNodes || []) {
        if (li.tagName?.toLowerCase() === 'li') {
          const text = extractText(li).replace(/\s+/g, ' ').trim();
          if (text && !isMediaMetadata(text)) {
            listItems.push(`<li>${text}</li>`);
          }
        }
      }
      if (listItems.length > 0) {
        output.push(`<${tagName}>${listItems.join('')}</${tagName}>`);
      }
      return;
    }
    
    // Handle details/accordion elements inside callouts - expand them
    if (tagName === 'details') {
      expandDetailsInCallout(child, extractText, isMediaMetadata, output);
      return;
    }
    
    // For containers, recurse
    if (tagName === 'div' || tagName === 'section' || !tagName) {
      for (const grandchild of child.childNodes || []) {
        if (grandchild.nodeType === 1) {
          processCalloutChild(grandchild);
        } else if (grandchild.nodeType === 3) {
          const text = (grandchild.textContent || '').trim();
          if (text && text.length > 10 && !isMediaMetadata(text)) {
            output.push(`<p>${text}</p>`);
          }
        }
      }
      return;
    }
    
    // Default: try to get text
    const text = extractText(child).replace(/\s+/g, ' ').trim();
    if (text && !isMediaMetadata(text)) {
      output.push(`<p>${text}</p>`);
    }
  }
  
  // Process all children of the callout
  for (const child of node.childNodes || []) {
    if (child.nodeType === 1) {
      processCalloutChild(child);
    } else if (child.nodeType === 3) {
      const text = (child.textContent || '').trim();
      if (text && text.length > 10 && !isMediaMetadata(text)) {
        output.push(`<p>${text}</p>`);
      }
    }
  }
  
  return output;
}

/**
 * Expand a details/accordion element - extract summary as heading and expand all content
 */
function expandDetailsContent(node: any, extractText: (n: any) => string, isMediaMetadata: (t: string) => boolean): void {
  if (!node) return;
  
  let summaryText = '';
  let hasSummary = false;
  
  // Process children to find summary and content
  for (const child of node.childNodes || []) {
    if (child.nodeType === 1) {
      const childTag = child.tagName?.toLowerCase() || '';
      
      // Handle summary element - extract and display as heading
      if (childTag === 'summary') {
        hasSummary = true;
        summaryText = extractText(child).replace(/\s+/g, ' ').trim();
        // Output summary as a heading (h4 to differentiate from main content headings)
        if (summaryText && !isMediaMetadata(summaryText)) {
          output.push(`<h4>${summaryText}</h4>`);
        }
        continue;
      }
      
      // Process other children as regular content (including nested accordions)
      // Nested accordions will be recursively expanded by processBlock
      processBlock(child);
    } else if (child.nodeType === 3) {
      // Handle text nodes directly inside details (not in summary)
      const text = (child.textContent || '').trim();
      if (text && text.length > 20 && !isMediaMetadata(text)) {
        output.push(`<p>${text}</p>`);
      }
    }
  }
  
  // If no summary but there's content, still process it
  if (!hasSummary) {
    // Process all children as regular content
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        processBlock(child);
      } else if (child.nodeType === 3) {
        const text = (child.textContent || '').trim();
        if (text && text.length > 20 && !isMediaMetadata(text)) {
          output.push(`<p>${text}</p>`);
        }
      }
    }
  }
}

/**
 * Expand a details/accordion element inside a callout - extract summary as heading and expand all content
 */
function expandDetailsInCallout(
  node: any, 
  extractText: (n: any) => string, 
  isMediaMetadata: (t: string) => boolean,
  output: string[]
): void {
  if (!node) return;
  
  let summaryText = '';
  let hasSummary = false;
  
  // Process children to find summary and content
  for (const child of node.childNodes || []) {
    if (child.nodeType === 1) {
      const childTag = child.tagName?.toLowerCase() || '';
      
      // Handle summary element - extract and display as heading
      if (childTag === 'summary') {
        hasSummary = true;
        summaryText = extractText(child).replace(/\s+/g, ' ').trim();
        // Output summary as a heading (h4 for callout context)
        if (summaryText && !isMediaMetadata(summaryText)) {
          output.push(`<h4>${summaryText}</h4>`);
        }
        continue;
      }
      
      // Handle nested accordions - recursively expand them
      if (childTag === 'details') {
        expandDetailsInCallout(child, extractText, isMediaMetadata, output);
        continue;
      }
      
      // Process other children as regular content
      // Handle headings
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(childTag)) {
        const text = extractText(child).replace(/\s+/g, ' ').trim();
        if (text && !isMediaMetadata(text)) {
          output.push(`<h4>${text}</h4>`);
        }
        continue;
      }
      
      // Handle paragraphs
      if (childTag === 'p') {
        const text = extractText(child).replace(/\s+/g, ' ').trim();
        if (text && !isMediaMetadata(text)) {
          output.push(`<p>${text}</p>`);
        }
        continue;
      }
      
      // Handle lists
      if (childTag === 'ul' || childTag === 'ol') {
        const listItems: string[] = [];
        for (const li of child.childNodes || []) {
          if (li.tagName?.toLowerCase() === 'li') {
            const text = extractText(li).replace(/\s+/g, ' ').trim();
            if (text && !isMediaMetadata(text)) {
              listItems.push(`<li>${text}</li>`);
            }
          }
        }
        if (listItems.length > 0) {
          output.push(`<${childTag}>${listItems.join('')}</${childTag}>`);
        }
        continue;
      }
      
      // Handle blockquotes
      if (childTag === 'blockquote') {
        const text = extractText(child).replace(/\s+/g, ' ').trim();
        if (text && !isMediaMetadata(text)) {
          output.push(`<blockquote>${text}</blockquote>`);
        }
        continue;
      }
      
      // For containers, recurse into children
      if (childTag === 'div' || childTag === 'section' || !childTag) {
        for (const grandchild of child.childNodes || []) {
          if (grandchild.nodeType === 1) {
            // Recursively handle nested elements
            if (grandchild.tagName?.toLowerCase() === 'details') {
              expandDetailsInCallout(grandchild, extractText, isMediaMetadata, output);
            } else {
              // Process other elements
              const text = extractText(grandchild).replace(/\s+/g, ' ').trim();
              if (text && text.length > 10 && !isMediaMetadata(text)) {
                output.push(`<p>${text}</p>`);
              }
            }
          } else if (grandchild.nodeType === 3) {
            const text = (grandchild.textContent || '').trim();
            if (text && text.length > 10 && !isMediaMetadata(text)) {
              output.push(`<p>${text}</p>`);
            }
          }
        }
        continue;
      }
      
      // Default: try to extract text
      const text = extractText(child).replace(/\s+/g, ' ').trim();
      if (text && text.length > 10 && !isMediaMetadata(text)) {
        output.push(`<p>${text}</p>`);
      }
    } else if (child.nodeType === 3) {
      // Handle text nodes directly inside details (not in summary)
      const text = (child.textContent || '').trim();
      if (text && text.length > 10 && !isMediaMetadata(text)) {
        output.push(`<p>${text}</p>`);
      }
    }
  }
  
  // If no summary but there's content, still process it
  if (!hasSummary) {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        const childTag = child.tagName?.toLowerCase() || '';
        if (childTag === 'details') {
          expandDetailsInCallout(child, extractText, isMediaMetadata, output);
        } else {
          const text = extractText(child).replace(/\s+/g, ' ').trim();
          if (text && text.length > 10 && !isMediaMetadata(text)) {
            output.push(`<p>${text}</p>`);
          }
        }
      } else if (child.nodeType === 3) {
        const text = (child.textContent || '').trim();
        if (text && text.length > 10 && !isMediaMetadata(text)) {
          output.push(`<p>${text}</p>`);
        }
      }
    }
  }
}

interface CalloutWithContext {
  content: string;  // Formatted HTML content of the callout
  contextBefore: string;  // Some text that appears before the callout
}

/**
 * Extract callouts from original HTML with context for positioning
 */
function extractCalloutsWithContext(html: string): CalloutWithContext[] {
  const callouts: CalloutWithContext[] = [];
  const { document } = parseHTML(`<div>${html}</div>`);
  
  const calloutSelectors = [
    'aside',
    '[class*="callout"]',
    '[class*="highlight"]',
    '[class*="featured"]',
    '[class*="big-idea"]',
    '[class*="key-point"]',
    '[class*="summary"]',
    '[class*="note-box"]',
    '[class*="info-box"]',
    '[class*="pullquote"]',
    '[class*="pull-quote"]',
  ];
  
  // Helper to extract text
  function getTextContent(node: any): string {
    if (!node) return '';
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }
  
  // Helper to format callout content - preserving headings and structure
  function formatCalloutContent(node: any): string {
    const parts: string[] = [];
    
    // First, look for any heading-like elements (could be styled divs, spans with classes, etc.)
    const headingSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[class*="title"]', '[class*="heading"]', '[class*="header"]', 'strong:first-child'];
    for (const sel of headingSelectors) {
      try {
        const heading = node.querySelector?.(sel);
        if (heading) {
          const text = getTextContent(heading);
          if (text && text.length > 2 && text.length < 100) {
            parts.push(`<h4>${text}</h4>`);
            break;  // Only take first heading
          }
        }
      } catch {
        // Selector not supported
      }
    }
    
    function processNode(n: any, skipHeadings: boolean = false): void {
      if (!n) return;
      const tag = n.tagName?.toLowerCase() || '';
      const className = (n.className || '').toLowerCase();
      
      // Skip media
      if (['script', 'style', 'img', 'video', 'audio', 'svg', 'figure', 'button'].includes(tag)) return;
      
      // Skip headings if we already extracted one
      if (skipHeadings && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return;
      if (skipHeadings && (className.includes('title') || className.includes('heading') || className.includes('header'))) return;
      
      // Headings (if not skipping)
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        const text = getTextContent(n);
        if (text && text.length > 2) parts.push(`<h4>${text}</h4>`);
        return;
      }
      
      // Paragraphs
      if (tag === 'p') {
        const text = getTextContent(n);
        if (text && text.length > 5) parts.push(`<p>${text}</p>`);
        return;
      }
      
      // Lists
      if (tag === 'ul' || tag === 'ol') {
        const items: string[] = [];
        for (const li of n.querySelectorAll?.('li') || []) {
          const text = getTextContent(li);
          if (text) items.push(`<li>${text}</li>`);
        }
        if (items.length) parts.push(`<${tag}>${items.join('')}</${tag}>`);
        return;
      }
      
      // Recurse into containers
      for (const child of n.childNodes || []) {
        if (child.nodeType === 1) {
          processNode(child, true);  // Skip headings in recursion since we got it above
        } else if (child.nodeType === 3) {
          const text = (child.textContent || '').trim();
          if (text && text.length > 20) parts.push(`<p>${text}</p>`);
        }
      }
    }
    
    processNode(node, parts.length > 0);  // Skip headings if we already found one
    return parts.join('\n');
  }
  
  // Helper to find preceding text content by walking up and back in the DOM
  function findPrecedingText(el: any): string {
    // Try siblings first
    let sibling = el.previousElementSibling;
    let attempts = 0;
    while (sibling && attempts < 5) {
      const tag = sibling.tagName?.toLowerCase() || '';
      // Skip non-content elements
      if (!['script', 'style', 'aside', 'nav', 'header', 'footer'].includes(tag)) {
        const text = getTextContent(sibling);
        if (text && text.length > 30) {
          return text.substring(0, 150);
        }
      }
      sibling = sibling.previousElementSibling;
      attempts++;
    }
    
    // Try parent's previous siblings
    let parent = el.parentElement;
    let parentAttempts = 0;
    while (parent && parentAttempts < 3) {
      sibling = parent.previousElementSibling;
      attempts = 0;
      while (sibling && attempts < 5) {
        const tag = sibling.tagName?.toLowerCase() || '';
        if (!['script', 'style', 'aside', 'nav', 'header', 'footer'].includes(tag)) {
          const text = getTextContent(sibling);
          if (text && text.length > 30) {
            return text.substring(0, 150);
          }
        }
        sibling = sibling.previousElementSibling;
        attempts++;
      }
      parent = parent.parentElement;
      parentAttempts++;
    }
    
    return '';
  }
  
  // Find callouts
  for (const selector of calloutSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const content = formatCalloutContent(el);
        if (!content || content.length < 20) continue;
        
        // Get context: find previous content
        const contextBefore = findPrecedingText(el);
        
        // Avoid duplicates
        const contentStart = content.substring(0, 50).toLowerCase().replace(/<[^>]+>/g, '');
        if (!callouts.some(c => c.content.toLowerCase().includes(contentStart))) {
          callouts.push({ content, contextBefore });
        }
      }
    } catch {
      // Selector not supported
    }
  }
  
  return callouts;
}

/**
 * Expand all accordion (details/summary) elements in HTML content
 * Converts summary to heading and expands all content
 * Handles nested accordions by processing from innermost to outermost
 */
function expandAccordionsInContent(content: string): string {
  if (!content || !content.includes('<details')) {
    return content;
  }
  
  const { document } = parseHTML(`<div>${content}</div>`);
  const root = document.querySelector('div');
  if (!root) return content;
  
  // Process all details elements, starting with the deepest nested ones first
  // We'll keep processing until no details elements remain
  let hasDetails = true;
  let iterations = 0;
  const maxIterations = 10; // Safety limit to prevent infinite loops
  
  while (hasDetails && iterations < maxIterations) {
    iterations++;
    const detailsElements = Array.from(root.querySelectorAll('details'));
    hasDetails = detailsElements.length > 0;
    
    for (const detailsEl of detailsElements) {
      let summaryText = '';
      let hasSummary = false;
      const expandedNodes: any[] = [];
      
      // Process children to find summary and content
      for (const child of Array.from(detailsEl.childNodes || [])) {
        if (child.nodeType === 1) {
          const childTag = child.tagName?.toLowerCase() || '';
          
          // Handle summary element - extract text for heading
          if (childTag === 'summary') {
            hasSummary = true;
            summaryText = (child.textContent || '').replace(/\s+/g, ' ').trim();
            continue;
          }
          
          // For other children, clone them (nested details will be processed in next iteration)
          expandedNodes.push(child.cloneNode(true));
        } else if (child.nodeType === 3) {
          // Handle text nodes directly inside details (not in summary)
          const text = (child.textContent || '').trim();
          if (text && text.length > 0) {
            const p = document.createElement('p');
            p.textContent = text;
            expandedNodes.push(p);
          }
        }
      }
      
      // Create replacement container
      const fragment = document.createDocumentFragment();
      
      // Add summary as heading if present
      if (hasSummary && summaryText) {
        const heading = document.createElement('h4');
        heading.textContent = summaryText;
        fragment.appendChild(heading);
      }
      
      // Add expanded content
      for (const node of expandedNodes) {
        fragment.appendChild(node);
      }
      
      // Replace the details element with the expanded content
      if (detailsEl.parentNode) {
        detailsEl.parentNode.replaceChild(fragment, detailsEl);
      }
    }
  }
  
  return root.innerHTML;
}

/**
 * Remove images and captions from HTML content
 */
function removeImagesAndCaptions(content: string): string {
  // Parse the HTML to properly remove elements
  const { document } = parseHTML(`<div>${content}</div>`);
  const root = document.querySelector('div');
  if (!root) return content;
  
  // Remove all image-related elements
  const imageElements = root.querySelectorAll('img, picture, figure, figcaption, [class*="image"], [class*="photo"], [class*="caption"], [id*="image"], [id*="photo"], [id*="caption"]');
  imageElements.forEach(el => el.remove());
  
  // Remove elements that are likely captions based on content/positioning
  // Look for short text nodes that might be captions
  const allElements = root.querySelectorAll('*');
  allElements.forEach(el => {
    const tagName = el.tagName?.toLowerCase() || '';
    const className = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const textContent = (el.textContent || '').trim();
    
    // Remove if it looks like a caption/credit/source
    if (
      className.includes('caption') ||
      className.includes('credit') ||
      className.includes('source') ||
      className.includes('image-credit') ||
      id.includes('caption') ||
      id.includes('credit') ||
      id.includes('source') ||
      // Remove very short paragraphs that might be captions (but keep headings)
      (tagName === 'p' && textContent.length < 50 && (
        textContent.toLowerCase().includes('credit') ||
        textContent.toLowerCase().includes('photo') ||
        textContent.toLowerCase().includes('image') ||
        /^(photo|image|credit|source):/i.test(textContent)
      ))
    ) {
      el.remove();
    }
  });
  
  return root.innerHTML;
}

/**
 * Extract article content from HTML string
 * @param html - Raw HTML content from the page
 * @param url - URL of the page (for resolving relative URLs)
 * @returns Extracted article content as clean HTML string, or null if extraction fails
 */
export async function extractArticleContent(html: string, url: string): Promise<string | null> {
  try {
    // First, extract callouts before any processing strips them
    const callouts = extractCalloutsWithContext(html);
    
    // Try @extractus/article-extractor first (more reliable for modern sites)
    // It already returns clean HTML, so we trust it directly
    let cleanedContent: string | null = null;
    
    try {
      const extracted = await extract(url, {
        html,
        fetchOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://harvous.com)'
          }
        }
      });
      
      if (extracted && extracted.content) {
        // @extractus/article-extractor already returns clean HTML with proper structure
        // Just ensure it's a string and has content
        cleanedContent = typeof extracted.content === 'string' 
          ? extracted.content 
          : String(extracted.content);
        
        // Expand any accordions in the extracted content
        cleanedContent = expandAccordionsInContent(cleanedContent);
      }
    } catch (error) {
      // Fall through to Readability fallback
      console.warn('@extractus/article-extractor failed, trying Readability:', error);
    }
    
    // Fallback to Readability if extractus didn't work or didn't return enough content
    if (!cleanedContent || cleanedContent.replace(/<[^>]+>/g, '').trim().length < 200) {
      // Parse HTML using linkedom
      const { document } = parseHTML(html);
      
      // Create Readability instance
      // @ts-ignore - document type from linkedom
      const reader = new Readability(document, {
        debug: false,
        maxElemsToParseToMainContent: 0, // No limit
        nbTopCandidates: 5,
        charThreshold: 500, // Minimum characters to consider it an article
      });
      
      // Extract article
      const article = reader.parse();
      
      if (article && article.content) {
        // Convert to clean text paragraphs (no images, videos, complex HTML)
        const readabilityContent = htmlToCleanParagraphs(article.content);
        if (readabilityContent && readabilityContent.replace(/<[^>]+>/g, '').trim().length > (cleanedContent?.replace(/<[^>]+>/g, '').trim().length || 0)) {
          cleanedContent = readabilityContent;
        }
      }
      
      // Last resort: try extracting from main/article tags directly
      if (!cleanedContent || cleanedContent.replace(/<[^>]+>/g, '').trim().length < 200) {
        const { document: fallbackDoc } = parseHTML(html);
        const mainContent = fallbackDoc.querySelector('main, article, [role="main"]');
        if (mainContent) {
          const fallbackContent = htmlToCleanParagraphs(mainContent.innerHTML);
          if (fallbackContent && fallbackContent.replace(/<[^>]+>/g, '').trim().length > (cleanedContent?.replace(/<[^>]+>/g, '').trim().length || 0)) {
            cleanedContent = fallbackContent;
          }
        }
      }
    }
    
    if (!cleanedContent) {
      console.warn('All extraction methods failed');
      return null;
    }
    
    // Remove images and captions from the extracted content
    cleanedContent = removeImagesAndCaptions(cleanedContent);
    
    // Insert callouts that weren't captured by Readability
    for (const callout of callouts) {
      // Check if this callout is already in the content
      const plainCalloutText = callout.content.replace(/<[^>]+>/g, '').substring(0, 50).toLowerCase();
      if (cleanedContent.toLowerCase().includes(plainCalloutText)) {
        continue;  // Already captured
      }
      
      // Try to find the context and insert after it
      if (callout.contextBefore) {
        const contextLower = callout.contextBefore.toLowerCase();
        const contentLower = cleanedContent.toLowerCase();
        const searchContext = contextLower.substring(0, 50);
        const contextIndex = contentLower.indexOf(searchContext);
        
        if (contextIndex !== -1) {
          // Find the end of the paragraph/block containing this context
          const afterContext = cleanedContent.substring(contextIndex);
          const nextBlockEnd = afterContext.search(/<\/(p|h[1-6]|ul|ol|blockquote)>/);
          
          if (nextBlockEnd !== -1) {
            const insertPoint = contextIndex + nextBlockEnd + afterContext.match(/<\/(p|h[1-6]|ul|ol|blockquote)>/)![0].length;
            cleanedContent = 
              cleanedContent.substring(0, insertPoint) + 
              `\n<blockquote>\n${callout.content}\n</blockquote>` + 
              cleanedContent.substring(insertPoint);
            continue;
          }
        }
      }
      
      // Fallback: append at end
      cleanedContent += `\n<blockquote>\n${callout.content}\n</blockquote>`;
    }
    
    return cleanedContent || null;
  } catch (error) {
    console.error('Error extracting article content:', error);
    return null;
  }
}

/**
 * Extract article content and return with metadata
 * @param html - Raw HTML content from the page
 * @param url - URL of the page
 * @returns Object with content and metadata, or null if extraction fails
 */
export function extractArticleWithMetadata(html: string, url: string): {
  content: string;
  title: string;
  excerpt: string;
} | null {
  try {
    const { document } = parseHTML(html);
    // @ts-ignore - document type from linkedom
    const reader = new Readability(document, {
      debug: false,
      maxElemsToParseToMainContent: 0,
      nbTopCandidates: 5,
      charThreshold: 500,
    });
    
    const article = reader.parse();
    
    if (!article) {
      return null;
    }
    
    // Convert to clean text paragraphs
    const cleanedContent = htmlToCleanParagraphs(article.content);
    
    return {
      content: cleanedContent || '',
      title: article.title || '',
      excerpt: article.excerpt || '',
    };
  } catch (error) {
    console.error('Error extracting article with metadata:', error);
    return null;
  }
}
