/**
 * Parses markdown export format from Harvous
 * Supports portable YAML-frontmatter exports and legacy footer metadata exports.
 */
import {
  isPortableMarkdownExport,
  parsePortableMarkdownExport,
  type PortableNoteDocument,
} from '@/utils/portable-markdown';

export interface ParsedMarkdownNote {
  title: string;
  content: string;
  createdDate: string | null;
  updatedDate: string | null;
  threadName: string | null;
  threadColor: string | null;
  tags: string[];
  scriptureReference: string | null;
  scriptureTranslation: string | null;
  /** Present for portable imports — full highlight payload. */
  portable?: PortableNoteDocument;
}

export function parseMarkdownExport(markdownContent: string): ParsedMarkdownNote[] {
  if (isPortableMarkdownExport(markdownContent)) {
    return parsePortableMarkdownExport(markdownContent).map(portableDocToParsedNote);
  }
  return parseLegacyMarkdownExport(markdownContent);
}

function portableDocToParsedNote(doc: PortableNoteDocument): ParsedMarkdownNote {
  return {
    title: doc.meta.title?.trim() || 'Untitled',
    content: doc.body,
    createdDate: doc.meta.created || null,
    updatedDate: doc.meta.updated || null,
    threadName: doc.meta.thread || null,
    threadColor: doc.meta.threadColor || null,
    tags: doc.meta.tags || [],
    scriptureReference: doc.meta.scriptureReference || null,
    scriptureTranslation: doc.meta.scriptureTranslation || null,
    portable: doc,
  };
}

function parseLegacyMarkdownExport(markdownContent: string): ParsedMarkdownNote[] {
  const notes: ParsedMarkdownNote[] = [];
  
  // Split by metadata separators (---)
  // Each note section is: title + content + metadata block
  const sections = markdownContent.split(/\n---\n/);
  
  for (const section of sections) {
    if (!section.trim()) continue;
    
    try {
      const note = parseMarkdownNoteSection(section);
      if (note) {
        notes.push(note);
      }
    } catch (error) {
      console.error('Error parsing markdown note section:', error);
      // Continue with next section
    }
  }
  
  return notes;
}

/**
 * Parses a single note section from markdown export
 */
function parseMarkdownNoteSection(section: string): ParsedMarkdownNote | null {
  const lines = section.split('\n');
  
  // Find metadata block (starts with ---)
  let metadataStartIndex = -1;
  let metadataEndIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (metadataStartIndex === -1) {
        metadataStartIndex = i;
      } else {
        metadataEndIndex = i;
        break;
      }
    }
  }
  
  // Extract title (first # heading before metadata)
  let title = '';
  let titleEndIndex = 0;
  
  for (let i = 0; i < (metadataStartIndex !== -1 ? metadataStartIndex : lines.length); i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ')) {
      title = line.substring(2).trim();
      titleEndIndex = i;
      break;
    }
  }
  
  // Extract content (between title and metadata)
  const contentStartIndex = title ? titleEndIndex + 1 : 0;
  const contentEndIndex = metadataStartIndex !== -1 ? metadataStartIndex : lines.length;
  
  const contentLines = lines.slice(contentStartIndex, contentEndIndex);
  const content = contentLines.join('\n').trim();
  
  // Parse metadata if present
  let createdDate: string | null = null;
  let updatedDate: string | null = null;
  let threadName: string | null = null;
  let threadColor: string | null = null;
  const tags: string[] = [];
  let scriptureReference: string | null = null;
  let scriptureTranslation: string | null = null;
  
  if (metadataStartIndex !== -1 && metadataEndIndex !== -1) {
    const metadataLines = lines.slice(metadataStartIndex + 1, metadataEndIndex);
    
    for (const line of metadataLines) {
      const trimmed = line.trim();
      
      // Parse Created date
      if (trimmed.startsWith('**Created:**')) {
        createdDate = trimmed.replace('**Created:**', '').trim();
      }
      
      // Parse Updated date
      if (trimmed.startsWith('**Updated:**')) {
        updatedDate = trimmed.replace('**Updated:**', '').trim();
      }
      
      // Parse Thread
      if (trimmed.startsWith('**Thread:**')) {
        threadName = trimmed.replace('**Thread:**', '').trim();
      }
      
      // Parse Thread Color
      if (trimmed.startsWith('**Thread Color:**')) {
        threadColor = trimmed.replace('**Thread Color:**', '').trim();
      }
      
      // Parse Tags
      if (trimmed.startsWith('**Tags:**')) {
        const tagsString = trimmed.replace('**Tags:**', '').trim();
        tags.push(...tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0));
      }
      
      // Parse Scripture Reference
      if (trimmed.startsWith('**Scripture Reference:**')) {
        const scriptureString = trimmed.replace('**Scripture Reference:**', '').trim();
        // Format: "John 3:16 (NET)" or "John 3:16"
        const match = scriptureString.match(/^(.+?)\s*\((.+?)\)$/);
        if (match) {
          scriptureReference = match[1].trim();
          scriptureTranslation = match[2].trim();
        } else {
          scriptureReference = scriptureString;
          scriptureTranslation = 'NET'; // Default
        }
      }
    }
  }
  
  // Skip if no content
  if (!content && !title) {
    return null;
  }
  
  return {
    title: title || 'Untitled',
    content,
    createdDate,
    updatedDate,
    threadName,
    threadColor,
    tags,
    scriptureReference,
    scriptureTranslation,
  };
}

