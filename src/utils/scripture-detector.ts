// Scripture Detection Utility
// Detects both scripture references and actual Bible verse text

import { BIBLE_STUDY_KEYWORDS } from './bible-study-keywords';

export interface ScriptureReference {
  book: string;
  chapter: number;
  verse: number | [number, number]; // Single verse or range
  reference: string; // Full reference string like "John 3:16" or "John 3:16-17"
}

export interface ScriptureDetection {
  isScripture: boolean;
  type: 'reference' | 'text' | 'both' | null;
  references: ScriptureReference[];
  confidence: number;
  detectedText?: string; // The actual text that was detected as scripture
}

// NET Bible copyright attribution
export const NET_BIBLE_COPYRIGHT = 'Scripture quotations are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com All rights reserved.';

// Get all Bible book names from keywords
const getBibleBookNames = (): string[] => {
  return BIBLE_STUDY_KEYWORDS
    .filter(k => k.category === 'book')
    .map(k => k.name);
};

// Get book name variations (including synonyms)
const getBookNameVariations = (): string[] => {
  const variations: string[] = [];
  BIBLE_STUDY_KEYWORDS
    .filter(k => k.category === 'book')
    .forEach(k => {
      variations.push(k.name);
      variations.push(...k.synonyms);
    });
  return variations;
};

// Normalize text for matching (remove punctuation, lowercase, etc.)
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[.,;:!?'"()\-–—]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

// Format book name for Bible.org API (standard names work directly)
export const formatBookNameForAPI = (bookName: string): string => {
  // Bible.org API accepts standard book names like "John", "1 Corinthians", etc.
  // Just return as-is, API handles them correctly
  return bookName.trim();
};

// Parse scripture reference from text
const parseReference = (match: string): ScriptureReference | null => {
  // Patterns: "John 3:16", "1 Corinthians 13:4-7", "Matthew 26:6-13, 17-30"
  // Match: Book Chapter:VerseGroups where VerseGroups can be "6-13, 17-30" or "6-13" or "6"
  // Updated to handle optional spaces around dashes: "6 - 13" or "6-13"
  const patterns = [
    // Comma-separated verse groups: "Book 1:2-3, 5-7, 10" or "Book 1:2 - 3, 5 - 7, 10"
    /^(.+?)\s+(\d+):((?:\d+(?:\s*-\s*\d+)?)(?:,\s*\d+(?:\s*-\s*\d+)?)*)$/,
    // Single range: "Book 1:2-3" or "Book 1:2 - 3"
    /^(.+?)\s+(\d+):(\d+)\s*-\s*(\d+)$/,
    // Single verse: "Book 1:2"
    /^(.+?)\s+(\d+):(\d+)$/,
    // Chapter only: "Book 1" (treat as chapter 1, verse 1)
    /^(.+?)\s+(\d+)$/,
  ];

  const bookNames = getBookNameVariations();
  const normalizedMatch = match.trim();

  for (const pattern of patterns) {
    const matchResult = normalizedMatch.match(pattern);
    if (!matchResult) continue;

    let bookPart = matchResult[1].trim();
    const chapter = parseInt(matchResult[2]);

    // Try to match book name
    for (const bookName of bookNames) {
      const normalizedBookName = normalizeText(bookName);
      const normalizedBookPart = normalizeText(bookPart);

      if (normalizedBookPart === normalizedBookName || 
          normalizedBookPart.startsWith(normalizedBookName) ||
          normalizedBookName.startsWith(normalizedBookPart)) {
        // Get canonical book name
        const canonicalBook = BIBLE_STUDY_KEYWORDS.find(
          k => k.category === 'book' && 
          (k.name.toLowerCase() === bookName.toLowerCase() || 
           k.synonyms.some(s => s.toLowerCase() === bookName.toLowerCase()))
        )?.name || bookName;

        if (matchResult.length === 4 && matchResult[3].includes(',')) {
          // Comma-separated verse groups detected (e.g., "6-13, 17-30")
          const verseGroups = matchResult[3].trim();
          // Extract first and last verse numbers from all groups
          const allVerses: number[] = [];
          verseGroups.split(',').forEach(group => {
            const trimmed = group.trim();
            if (trimmed.includes('-')) {
              const [start, end] = trimmed.split('-').map(v => parseInt(v.trim()));
              for (let v = start; v <= end; v++) {
                allVerses.push(v);
              }
            } else {
              allVerses.push(parseInt(trimmed));
            }
          });
          
          const verseStart = Math.min(...allVerses);
          const verseEnd = Math.max(...allVerses);
          
          // Clean up verse groups: remove spaces after commas and normalize spaces around dashes for API
          let cleanVerseGroups = verseGroups.replace(/,\s+/g, ',');
          cleanVerseGroups = cleanVerseGroups.replace(/\s*-\s*/g, '-');
          
          return {
            book: canonicalBook,
            chapter,
            verse: [verseStart, verseEnd] as [number, number],
            reference: `${canonicalBook} ${chapter}:${cleanVerseGroups}`
          };
        } else if (matchResult.length === 5) {
          // Single range detected (Pattern 2: separate capture groups for start and end)
          const verseStart = parseInt(matchResult[3]);
          const verseEnd = parseInt(matchResult[4]);
          return {
            book: canonicalBook,
            chapter,
            verse: [verseStart, verseEnd] as [number, number],
            reference: `${canonicalBook} ${chapter}:${verseStart}-${verseEnd}`
          };
        } else if (matchResult.length === 4 && !matchResult[3].includes(',') && matchResult[3].includes('-')) {
          // Single range detected (Pattern 1: range in single capture group like "8-23")
          const versePart = matchResult[3].trim();
          const [start, end] = versePart.split(/\s*-\s*/).map(v => parseInt(v.trim()));
          if (!isNaN(start) && !isNaN(end)) {
            return {
              book: canonicalBook,
              chapter,
              verse: [start, end] as [number, number],
              reference: `${canonicalBook} ${chapter}:${start}-${end}`
            };
          }
          // Fall through to single verse if parsing fails
        } else if (matchResult.length === 4 && !matchResult[3].includes(',') && !matchResult[3].includes('-')) {
          // Single verse
          const verse = parseInt(matchResult[3]);
          return {
            book: canonicalBook,
            chapter,
            verse,
            reference: `${canonicalBook} ${chapter}:${verse}`
          };
        } else if (matchResult.length === 3) {
          // Chapter only
          return {
            book: canonicalBook,
            chapter,
            verse: 1,
            reference: `${canonicalBook} ${chapter}:1`
          };
        }
      }
    }
  }

  return null;
};

// Detect scripture references in text
export const detectScriptureReferences = (text: string): ScriptureReference[] => {
  const references: ScriptureReference[] = [];
  const bookNames = getBibleBookNames();

  // Build regex pattern for all book names
  // Escape special regex characters
  const escapedBookNames = bookNames.map(name => 
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  // Pattern 1: "Book Chapter:Verse" or "Book Chapter:Verse-Verse" or "Book Chapter:Verse-Verse, Verse-Verse"
  // Captures comma-separated verse groups like "Matthew 26:6-13, 17-30"
  // Use a simpler pattern and validate matches afterward
  // Updated to better handle ranges with dashes - allow optional spaces around dashes
  const referencePattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+):(\\d+(?:\\s*-\\s*\\d+)?(?:,\\s*\\d+(?:\\s*-\\s*\\d+)?)*)(?!\\d)`,
    'gi'
  );

  let match;
  while ((match = referencePattern.exec(text)) !== null) {
    let fullMatch = match[0];
    const originalMatchEnd = match.index + fullMatch.length;
    let adjustedLastIndex = originalMatchEnd;
    
    // Check if the match ends with ", number" and what follows forms a book name
    // This indicates we matched too much (e.g., "Hebrews 13:2, 1" when "1 Peter" follows)
    const versePartMatch = fullMatch.match(/:\s*([^:]+)$/);
    if (versePartMatch && versePartMatch[1].includes(',')) {
      const verseGroups = versePartMatch[1];
      const lastCommaIndex = verseGroups.lastIndexOf(',');
      if (lastCommaIndex >= 0) {
        const afterLastComma = verseGroups.substring(lastCommaIndex + 1).trim();
        // If after the comma we have just a number (like "1"), check if it's part of a book name
        if (/^\d+$/.test(afterLastComma)) {
          // Check what comes after our match in the original text
          const textAfterMatch = text.substring(originalMatchEnd);
          // Extract the first word after the space (e.g., "Peter" from " Peter 4:9")
          const wordAfterSpace = textAfterMatch.match(/^\s+(\w+)/)?.[1];
          
          if (wordAfterSpace) {
            // Check if "number + space + word" forms a book name
            // For example, if we have ", 1" and " Peter" follows, check if "1 Peter" is a book name
            const potentialBookName = `${afterLastComma} ${wordAfterSpace}`;
            
            // Check if this potential book name matches any book name (including numbered books)
            const matchesBookName = bookNames.some(bookName => {
              const normalizedBook = normalizeText(bookName);
              const normalizedPotential = normalizeText(potentialBookName);
              return normalizedBook === normalizedPotential || 
                     normalizedBook.startsWith(normalizedPotential) ||
                     normalizedPotential.startsWith(normalizedBook);
            });
            
            if (matchesBookName) {
              // The number is part of the next book name, trim it from the match
              const trimmedLength = verseGroups.length - lastCommaIndex;
              fullMatch = fullMatch.substring(0, fullMatch.length - trimmedLength);
              // Adjust the regex's lastIndex to point to after the trimmed match
              // This ensures the next iteration can find "1 Peter 4:9"
              adjustedLastIndex = match.index + fullMatch.length;
            }
          }
        }
      }
    }
    
    const extracted = parseReference(fullMatch);
    if (extracted) {
      // Preserve the original matched text for display (with spaces intact)
      // Override the cleaned reference with the original to maintain user's formatting
      extracted.reference = fullMatch;
      
      // Avoid duplicates
      const isDuplicate = references.some(ref => 
        ref.reference === extracted.reference
      );
      if (!isDuplicate) {
        references.push(extracted);
      }
    }
    
    // Adjust the regex's lastIndex if we trimmed the match
    if (adjustedLastIndex !== originalMatchEnd) {
      referencePattern.lastIndex = adjustedLastIndex;
    }
  }

  return references;
};

// Parse scripture reference string into components
export const parseScriptureReference = (reference: string): { book: string; chapter: number; verse: number | [number, number] } | null => {
  const parsed = parseReference(reference);
  if (!parsed) return null;

  return {
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse
  };
};

// Main detection function
export const detectScripture = async (text: string): Promise<ScriptureDetection> => {
  if (!text || text.trim().length === 0) {
    return {
      isScripture: false,
      type: null,
      references: [],
      confidence: 0
    };
  }

  // Strip HTML tags for detection
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Step 1: Detect references
  const references = detectScriptureReferences(plainText);
  
  if (references.length > 0) {
    return {
      isScripture: true,
      type: 'reference',
      references,
      confidence: 0.9,
      detectedText: plainText
    };
  }

  // Step 2: Future - verse text detection would go here
  // For now, we only detect references

  return {
    isScripture: false,
    type: null,
    references: [],
    confidence: 0
  };
};

// Extract the best/most confident reference from detection
export const getPrimaryReference = (detection: ScriptureDetection): string | null => {
  if (detection.references.length > 0) {
    return detection.references[0].reference;
  }
  return null;
};

// Format scripture reference for display with divider between comma-separated groups
// "Matthew 26:6-13,17-30" → "Matthew 26:6-13 | 17-30"
export const formatReferenceForDisplay = (reference: string): string => {
  // Match pattern: Book Chapter:VerseGroups where VerseGroups can have commas
  const pattern = /^(.+?\s+\d+:)(.+)$/;
  const match = reference.match(pattern);
  
  if (!match) return reference;
  
  const prefix = match[1]; // e.g., "Matthew 26:"
  const verseGroups = match[2]; // e.g., "6-13,17-30"
  
  // Replace commas between verse groups with " | "
  const formattedGroups = verseGroups.replace(/,(?=\s*\d)/g, ' | ');
  
  return prefix + formattedGroups;
};

// Convert display format back to API format
// "Matthew 26:6-13 | 17-30" → "Matthew 26:6-13,17-30"
export const formatReferenceForAPI = (reference: string): string => {
  // Replace " | " (with spaces) with comma (no space)
  return reference.replace(/\s+\|\s+/g, ',');
};

// Normalize scripture reference to consistent format for storage and comparison
// Handles various spacing formats: "John 3: 16", "John 3:16 - 17", "Matthew 26:6-13, 17-30"
// Returns: "John 3:16", "John 3:16-17", "Matthew 26:6-13,17-30"
export const normalizeScriptureReference = (reference: string): string => {
  if (!reference || typeof reference !== 'string') {
    return reference;
  }

  // First, try to parse and use the normalized format from parseReference
  // This ensures we get the canonical book name and proper formatting
  const parsed = parseReference(reference.trim());
  if (parsed) {
    return parsed.reference;
  }

  // If parsing fails, do manual normalization
  // Remove spaces after colons: "John 3: 16" → "John 3:16"
  let normalized = reference.replace(/:\s+/g, ':');
  
  // Remove spaces after commas: "Matthew 26:6-13, 17-30" → "Matthew 26:6-13,17-30"
  normalized = normalized.replace(/,\s+/g, ',');
  
  // Normalize spaces around dashes in verse ranges: "John 3:16 - 17" → "John 3:16-17"
  // But be careful not to affect dashes in book names like "1 Corinthians"
  normalized = normalized.replace(/(\d+)\s*-\s*(\d+)/g, '$1-$2');
  
  // Trim whitespace
  normalized = normalized.trim();
  
  return normalized;
};

// Parse verse groups from a reference string
// "Matthew 26:6-13,17-30" → [{ start: 6, end: 13 }, { start: 17, end: 30 }]
export interface VerseGroup {
  start: number;
  end: number;
}

export const parseVerseGroups = (reference: string): VerseGroup[] => {
  // Extract the verse part after the colon
  const match = reference.match(/:\s*([^:]+)$/);
  if (!match) return [];

  const versePart = match[1].trim(); // e.g., "6-13,17-30" or "6-13 | 17-30"
  
  // Remove spaces and normalize (handle both comma and pipe separators)
  const normalized = versePart.replace(/\s+\|\s+/g, ',').replace(/,\s+/g, ',');
  
  // Split by comma to get individual groups
  const groups: VerseGroup[] = [];
  normalized.split(',').forEach(group => {
    const trimmed = group.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(v => parseInt(v.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        groups.push({ start, end });
      }
    } else {
      // Single verse
      const verse = parseInt(trimmed);
      if (!isNaN(verse)) {
        groups.push({ start: verse, end: verse });
      }
    }
  });

  return groups;
};

