/**
 * Parses CSV content with proper handling of escaped quotes, commas, and newlines
 * @param csvContent - Raw CSV string content
 * @returns Array of parsed note objects
 */
export interface ParsedCSVNote {
  threadTitle: string;
  threadColor: string | null;
  noteTitle: string;
  content: string;
  createdDate: string;
  tags: string[];
}

export function parseCSV(csvContent: string): ParsedCSVNote[] {
  const notes: ParsedCSVNote[] = [];
  const lines: string[] = [];
  
  // Handle CSV with potential newlines within quoted fields
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        currentLine += char;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (not in quotes)
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  
  // Add last line if exists
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  // Skip header row
  if (lines.length < 2) {
    return notes;
  }
  
  // Parse each row
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    
    try {
      const columns = parseCSVRow(row);
      
      // Support both old format (4 columns) and new format (6 columns with thread color)
      if (columns.length < 4) {
        console.warn(`Skipping invalid CSV row ${i + 1}: insufficient columns`);
        continue;
      }
      
      // Check if this is the new format (6 columns) or old format (5 columns)
      let threadTitle: string;
      let threadColor: string | null = null;
      let noteTitle: string;
      let content: string;
      let createdDate: string;
      let tagsString: string;
      
      if (columns.length >= 6) {
        // New format: Thread Title, Thread Color, Note Title, Note Content, Created Date, Tags
        threadTitle = columns[0] || '';
        threadColor = columns[1] || null;
        noteTitle = columns[2] || '';
        content = columns[3] || '';
        createdDate = columns[4] || '';
        tagsString = columns[5] || '';
      } else {
        // Old format: Thread Title, Note Title, Note Content, Created Date, Tags
        threadTitle = columns[0] || '';
        noteTitle = columns[1] || '';
        content = columns[2] || '';
        createdDate = columns[3] || '';
        tagsString = columns[4] || '';
      }
      
      // Parse tags (comma-separated)
      const tags = tagsString
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
      
      notes.push({
        threadTitle: threadTitle.trim(),
        threadColor: threadColor ? threadColor.trim() : null,
        noteTitle: noteTitle.trim(),
        content: content.trim(),
        createdDate: createdDate.trim(),
        tags,
      });
    } catch (error) {
      console.error(`Error parsing CSV row ${i + 1}:`, error);
      // Continue with next row
    }
  }
  
  return notes;
}

/**
 * Parses a single CSV row, handling quoted fields
 */
function parseCSVRow(row: string): string[] {
  const columns: string[] = [];
  let currentColumn = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentColumn += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Column separator (not in quotes)
      columns.push(currentColumn);
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }
  
  // Add last column
  columns.push(currentColumn);
  
  return columns;
}

