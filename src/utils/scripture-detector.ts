// Scripture Detection Utility
// Detects both scripture references and actual Bible verse text

import { BIBLE_STUDY_KEYWORDS } from './bible-study-keywords';
// @ts-ignore - JSON import with resolveJsonModule
import bibleChaptersData from '../data/bible-chapters.json';

// Bible chapter/verse data structure
interface BibleChapter {
  book: string;
  bookOrder: number;
  testament: 'old' | 'new';
  chapter: number;
  startVerse: number;
  endVerse: number;
}

// Bible chapter/verse data from https://gist.github.com/izakfilmalter/cdc1c9acb82b6ef94aedcf22c00d998f
// Build lookup map: Map<bookName, Map<chapter, { startVerse, endVerse }>>
let BIBLE_CHAPTERS_MAP: Map<string, Map<number, { startVerse: number; endVerse: number }>> | null = null;

function buildBibleChaptersMap(): Map<string, Map<number, { startVerse: number; endVerse: number }>> {
  if (BIBLE_CHAPTERS_MAP) {
    return BIBLE_CHAPTERS_MAP;
  }

  const map = new Map<string, Map<number, { startVerse: number; endVerse: number }>>();
  const data = bibleChaptersData as BibleChapter[];

  for (const chapter of data) {
    const bookName = chapter.book;
    if (!map.has(bookName)) {
      map.set(bookName, new Map());
    }
    const bookMap = map.get(bookName)!;
    bookMap.set(chapter.chapter, {
      startVerse: chapter.startVerse,
      endVerse: chapter.endVerse
    });
  }

  BIBLE_CHAPTERS_MAP = map;
  return map;
}

// Get chapter verse range for a book and chapter
export function getChapterVerseRange(book: string, chapter: number): { start: number; end: number } | null {
  const map = buildBibleChaptersMap();
  const bookMap = map.get(book);
  if (!bookMap) {
    return null;
  }
  const chapterData = bookMap.get(chapter);
  if (!chapterData) {
    return null;
  }
  return { start: chapterData.startVerse, end: chapterData.endVerse };
}

// Validate if a verse number is valid for a given book and chapter
export function validateVerseNumber(book: string, chapter: number, verse: number): boolean {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return false;
  }
  return verse >= range.start && verse <= range.end;
}

// Validate if a verse range is valid for a given book and chapter
export function validateVerseRange(book: string, chapter: number, startVerse: number, endVerse: number): boolean {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return false;
  }
  // Both start and end must be within the valid range
  return startVerse >= range.start && startVerse <= range.end &&
         endVerse >= range.start && endVerse <= range.end &&
         startVerse <= endVerse;
}

// Normalize chapter-only reference to include full verse range
// "Genesis 1" → "Genesis 1:1-31"
export function normalizeChapterReference(book: string, chapter: number): string | null {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return null;
  }
  return `${book} ${chapter}:${range.start}-${range.end}`;
}

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

// Helper function to validate and log warnings for scripture references
function validateAndWarn(ref: ScriptureReference): ScriptureReference {
  const { book, chapter, verse } = ref;
  
  if (Array.isArray(verse)) {
    // Verse range
    const [start, end] = verse;
    if (!validateVerseRange(book, chapter, start, end)) {
      const range = getChapterVerseRange(book, chapter);
      if (range) {
        console.warn(`Invalid verse range: ${ref.reference}. Valid range for ${book} ${chapter} is ${range.start}-${range.end}`);
      } else {
        console.warn(`Unknown book/chapter: ${book} ${chapter}`);
      }
    }
  } else {
    // Single verse
    if (!validateVerseNumber(book, chapter, verse)) {
      const range = getChapterVerseRange(book, chapter);
      if (range) {
        console.warn(`Invalid verse number: ${ref.reference}. Valid range for ${book} ${chapter} is ${range.start}-${range.end}`);
      } else {
        console.warn(`Unknown book/chapter: ${book} ${chapter}`);
      }
    }
  }
  
  return ref;
}

// Parse scripture reference from text
const parseReference = (match: string): ScriptureReference | null => {
  // Patterns: "John 3:16", "1 Corinthians 13:4-7", "Matthew 26:6-13, 17-30"
  // Match: Book Chapter:VerseGroups where VerseGroups can be "6-13, 17-30" or "6-13" or "6"
  // Updated to handle optional spaces around dashes: "6 - 13" or "6-13"
  // Updated to handle different dash types: hyphen (-), en-dash (–), em-dash (—)
  const patterns = [
    // Comma-separated verse groups: "Book 1:2-3, 5-7, 10" or "Book 1:2 - 3, 5 - 7, 10"
    /^(.+?)\s+(\d+):((?:\d+(?:\s*[-–—]\s*\d+)?)(?:,\s*\d+(?:\s*[-–—]\s*\d+)?)*)$/,
    // Single range: "Book 1:2-3" or "Book 1:2 - 3"
    /^(.+?)\s+(\d+):(\d+)\s*[-–—]\s*(\d+)$/,
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
            if (/[-–—]/.test(trimmed)) {
              const [start, end] = trimmed.split(/[-–—]/).map(v => parseInt(v.trim()));
              // Validate range: start must be <= end
              if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let v = start; v <= end; v++) {
                  allVerses.push(v);
                }
              } else if (!isNaN(start) && !isNaN(end) && start > end) {
                // Invalid range (start > end) - treat as single verse
                allVerses.push(start);
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
          
          return validateAndWarn({
            book: canonicalBook,
            chapter,
            verse: [verseStart, verseEnd] as [number, number],
            reference: `${canonicalBook} ${chapter}:${cleanVerseGroups}`
          });
        } else if (matchResult.length === 5) {
          // Single range detected (Pattern 2: separate capture groups for start and end)
          const verseStart = parseInt(matchResult[3]);
          const verseEnd = parseInt(matchResult[4]);
          // Validate range: start must be <= end
          if (!isNaN(verseStart) && !isNaN(verseEnd) && verseStart <= verseEnd) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [verseStart, verseEnd] as [number, number],
              reference: `${canonicalBook} ${chapter}:${verseStart}-${verseEnd}`
            });
          } else if (!isNaN(verseStart) && !isNaN(verseEnd) && verseStart > verseEnd) {
            // Invalid range (start > end) - treat as single verse
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: verseStart,
              reference: `${canonicalBook} ${chapter}:${verseStart}`
            });
          }
          // If parsing fails, fall through to single verse
        } else if (matchResult.length === 4 && !matchResult[3].includes(',') && /[-–—]/.test(matchResult[3])) {
          // Single range detected (Pattern 1: range in single capture group like "8-23")
          const versePart = matchResult[3].trim();
          const [start, end] = versePart.split(/\s*[-–—]\s*/).map(v => parseInt(v.trim()));
          // Validate range: start must be <= end
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [start, end] as [number, number],
              reference: `${canonicalBook} ${chapter}:${start}-${end}`
            });
          } else if (!isNaN(start) && !isNaN(end) && start > end) {
            // Invalid range (start > end) - treat as single verse
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: start,
              reference: `${canonicalBook} ${chapter}:${start}`
            });
          }
          // Fall through to single verse if parsing fails
        } else if (matchResult.length === 4 && !matchResult[3].includes(',') && !/[-–—]/.test(matchResult[3])) {
          // Single verse - check for dash using regex to handle all dash types
          const verse = parseInt(matchResult[3]);
          if (!isNaN(verse)) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse,
              reference: `${canonicalBook} ${chapter}:${verse}`
            });
          }
        } else if (matchResult.length === 3) {
          // Chapter only: treat as full chapter (e.g. "John 16" → "John 16:1-33")
          const range = getChapterVerseRange(canonicalBook, chapter);
          if (range) {
            const fullChapterRef = normalizeChapterReference(canonicalBook, chapter);
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [range.start, range.end] as [number, number],
              reference: fullChapterRef!
            });
          }
          // Fallback if chapter unknown
          return validateAndWarn({
            book: canonicalBook,
            chapter,
            verse: 1,
            reference: `${canonicalBook} ${chapter}:1`
          });
        }
      }
    }
  }

  return null;
};

// Validate if a detected reference is in a valid scripture context
// Rejects matches that are part of larger phrases (e.g., "John 3 years ago")
// This is a conservative check - only rejects clear false positives
function isValidScriptureContext(text: string, matchIndex: number, matchLength: number): boolean {
  const before = text.substring(Math.max(0, matchIndex - 30), matchIndex).trim();
  const after = text.substring(matchIndex + matchLength, matchIndex + matchLength + 30).trim();
  
  // Check if followed by common non-scripture words that indicate it's not a reference
  // Only check for words that are VERY likely to be false positives
  // Use word boundary to ensure we match whole words, not parts of words
  const invalidAfterPattern = /\b(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\s+(ago|later|before|after)\b/i;
  if (invalidAfterPattern.test(after)) {
    // Pattern like "3 years ago" or "5 dollars" - clear false positive
    return false;
  }
  
  // Check for specific false positive patterns
  // "John 3 years" - the word "years" immediately after a number
  const falsePositivePattern = /^\s*(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\b/i;
  if (falsePositivePattern.test(after)) {
    // Check if the reference ends with just a number (chapter-only pattern)
    // This catches "John 3 years" but allows "John 3:16 years" (though that's also unlikely)
    const refText = text.substring(matchIndex, matchIndex + matchLength);
    // If reference is just "Book Number" (no colon), and followed by "years", it's likely false
    if (!refText.includes(':') && falsePositivePattern.test(after)) {
      return false;
    }
  }
  
  // Valid references should be followed by punctuation, newline, space, or end of text
  // Allow most characters after - only reject if it's clearly part of a word
  const firstCharAfter = after.charAt(0);
  
  // If there's no text after, it's valid (end of text)
  if (!firstCharAfter) {
    return true;
  }
  
  // If it's a space, punctuation, or newline, it's valid
  const validAfterChars = /^[.,;:!?\s\n]/;
  if (validAfterChars.test(firstCharAfter)) {
    return true;
  }
  
  // If it's a lowercase letter immediately after (no space), it might be part of a word
  // But be conservative - only reject if it's clearly part of a word
  // For example, "John 3:16is" would be invalid, but "John 3:16 is" is valid (space before "is")
  // Since we already checked for space above, if we get here and it's lowercase, it might be invalid
  // But be very conservative - only reject if it's a common word pattern
  if (/^[a-z]/.test(after)) {
    // Check if it's a common word that would make it a false positive
    const commonWordsAfter = /^(is|are|was|were|has|have|had|will|would|can|could|should|may|might)\b/i;
    if (commonWordsAfter.test(after)) {
      // This is likely a false positive like "John 3 is" (though "John 3:16 is" should be valid)
      // But since there's no space, it's probably "John 3is" which is invalid
      // Actually, if there's no space, the regex wouldn't have matched "John 3" in the first place
      // So this is probably safe to allow
      return true; // Allow it - the regex matching already ensures proper spacing
    }
  }
  
  // Check if preceded by words that make it part of a phrase
  // Only reject if it's clearly a prepositional phrase
  const invalidBefore = /\b(about|around|over|under|near|from|to|at|in|on|for|with|by)\s+$/i;
  if (invalidBefore.test(before)) {
    // But allow if it's part of a valid phrase like "referring to John 3:16"
    // Actually, this is probably a false positive, so reject it
    return false;
  }
  
  // Default: allow the reference (be permissive)
  return true;
}

// Detect scripture references in text
export const detectScriptureReferences = (text: string): ScriptureReference[] => {
  const references: ScriptureReference[] = [];
  // Use variations (including synonyms) for detection, e.g., "Psalm" for "Psalms"
  const bookNames = getBookNameVariations();

  // Build regex pattern for all book names
  // Escape special regex characters
  const escapedBookNames = bookNames.map(name => 
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  // Dash pattern that matches hyphen (-), en-dash (–), and em-dash (—)
  const dashPattern = '[-–—]';
  
  // Pattern 1: "Book Chapter:Verse" or "Book Chapter:Verse-Verse" or "Book Chapter:Verse-Verse, Verse-Verse"
  // Captures comma-separated verse groups like "Matthew 26:6-13, 17-30"
  // Use a simpler pattern and validate matches afterward
  // Updated to handle different dash types (hyphen, en-dash, em-dash)
  // FIXED: Ensure verse numbers are fully captured by using word boundary or end of string
  // Changed negative lookahead to prevent matching when followed by digit that's part of another reference
  // This ensures "John 1:14" matches fully, not "John 1:1" from "John 1:14"
  // Use (?!\\d) to stop at word boundary or non-digit, but allow matching full multi-digit verses
  const referencePattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+):(\\d+(?:\\s*${dashPattern}\\s*\\d+)?(?:,\\s*\\d+(?:\\s*${dashPattern}\\s*\\d+)?)*)(?=\\s|$|[^\\d\\w])`,
    'gi'
  );

  // Pattern 2: "Book Chapter-Chapter" (chapter range without verses, e.g., "Matthew 5-7")
  const chapterRangePattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+)\\s*${dashPattern}\\s*(\\d+)(?!:)(?!\\d)`,
    'gi'
  );

  // Pattern 3: "Book Chapter" (single chapter without verses, e.g., "Matthew 5")
  // Must not be followed by a colon or dash to avoid matching partial references
  // Also must not be followed by space+digit (which might indicate a split reference like "Genesis 1 2:1-8")
  // IMPORTANT: Must not match when followed by dash+digit (e.g., "Exodus 33-34" should not match "Exodus 3")
  // FIXED: Relaxed (?!\\s+\\d) to allow matching at end of line/string and before punctuation
  // Changed to (?!\\s+\\d\\s) to only prevent matching when followed by space+digit+space (split reference)
  // This allows "Luke 2" to match even when followed by punctuation or at end of line
  const chapterOnlyPattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+)(?!:)(?!\\s*${dashPattern}\\s*\\d)(?!\\d)(?!\\s+\\d\\s)`,
    'gi'
  );

  let match;
  
  // First, find chapter:verse references (most specific)
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
      // Context validation: Check if this match is in a valid scripture context
      if (!isValidScriptureContext(text, match.index, fullMatch.length)) {
        // Skip this match - it's likely a false positive (e.g., "John 3 years ago")
        continue;
      }
      
      // Validation: Ensure the verse number in the parsed reference matches what was in the original match
      // This prevents issues where "John 1:14" might be incorrectly parsed as "John 1:1"
      const versePartInMatch = fullMatch.match(/:\s*(\d+)/);
      if (versePartInMatch) {
        const verseInMatch = parseInt(versePartInMatch[1]);
        if (Array.isArray(extracted.verse)) {
          // Verse range - check if start verse matches
          if (extracted.verse[0] !== verseInMatch && extracted.verse[0] < verseInMatch) {
            if (DEBUG) {
              console.warn('[Scripture Detection] Verse mismatch detected:', {
                originalMatch: fullMatch,
                parsedVerse: extracted.verse[0],
                matchVerse: verseInMatch
              });
            }
            // Re-parse with the correct verse number from the match
            const correctedVerse = verseInMatch;
            extracted.verse = correctedVerse;
            extracted.reference = `${extracted.book} ${extracted.chapter}:${correctedVerse}`;
          }
        } else {
          // Single verse - check if it matches
          if (extracted.verse !== verseInMatch && extracted.verse < verseInMatch) {
            // Correct the verse number
            extracted.verse = verseInMatch;
            extracted.reference = `${extracted.book} ${extracted.chapter}:${verseInMatch}`;
          }
        }
      }
      
      // Preserve the original matched text for display (with spaces intact)
      // Override the cleaned reference with the original to maintain user's formatting
      extracted.reference = fullMatch;
      
      // Avoid duplicates by comparing normalized references
      // This prevents duplicates like "John 3:16" vs "John 3: 16"
      const normalizedExtracted = normalizeScriptureReference(extracted.reference);
      const isDuplicate = references.some(ref => {
        const normalizedRef = normalizeScriptureReference(ref.reference);
        return normalizedRef === normalizedExtracted;
      });
      if (!isDuplicate) {
        references.push(extracted);
      }
    }
    
    // Adjust the regex's lastIndex if we trimmed the match
    if (adjustedLastIndex !== originalMatchEnd) {
      referencePattern.lastIndex = adjustedLastIndex;
    }
  }

  // Next, find chapter range references (e.g., "Matthew 5-7")
  while ((match = chapterRangePattern.exec(text)) !== null) {
    // Context validation: Check if this match is in a valid scripture context
    if (!isValidScriptureContext(text, match.index, match[0].length)) {
      // Skip this match - it's likely a false positive
      continue;
    }
    
    const bookPart = match[1].trim();
    const chapterStart = parseInt(match[2]);
    const chapterEnd = parseInt(match[3]);
    
    // Find canonical book name
    const canonicalBook = BIBLE_STUDY_KEYWORDS.find(
      k => k.category === 'book' && 
      (k.name.toLowerCase() === bookPart.toLowerCase() || 
       k.synonyms.some(s => s.toLowerCase() === bookPart.toLowerCase()))
    )?.name || bookPart;
    
    // Get verse ranges for start and end chapters
    const startRange = getChapterVerseRange(canonicalBook, chapterStart);
    const endRange = getChapterVerseRange(canonicalBook, chapterEnd);
    
    if (startRange && endRange && chapterStart <= chapterEnd) {
      // Create reference spanning from first verse of first chapter to last verse of last chapter
      const reference: ScriptureReference = {
        book: canonicalBook,
        chapter: chapterStart, // Primary chapter for API calls
        verse: [startRange.start, endRange.end] as [number, number],
        reference: `${canonicalBook} ${chapterStart}-${chapterEnd}` // Keep chapter range format
      };
      
      // Check for duplicates
      const normalizedRef = `${canonicalBook} ${chapterStart}-${chapterEnd}`;
      const isDuplicate = references.some(ref => 
        normalizeScriptureReference(ref.reference) === normalizedRef
      );
      if (!isDuplicate) {
        references.push(reference);
      }
    }
  }

  // Finally, find single chapter references (e.g., "Matthew 5")
  while ((match = chapterOnlyPattern.exec(text)) !== null) {
    // Context validation: Check if this match is in a valid scripture context
    // This is especially important for chapter-only patterns which are more prone to false positives
    if (!isValidScriptureContext(text, match.index, match[0].length)) {
      // Skip this match - it's likely a false positive (e.g., "John 3 years ago")
      continue;
    }
    
    const bookPart = match[1].trim();
    const chapter = parseInt(match[2]);
    
    // Find canonical book name
    const canonicalBook = BIBLE_STUDY_KEYWORDS.find(
      k => k.category === 'book' && 
      (k.name.toLowerCase() === bookPart.toLowerCase() || 
       k.synonyms.some(s => s.toLowerCase() === bookPart.toLowerCase()))
    )?.name || bookPart;
    
    // Get verse range for this chapter
    const range = getChapterVerseRange(canonicalBook, chapter);
    
    if (range) {
      // Create reference spanning entire chapter
      const reference: ScriptureReference = {
        book: canonicalBook,
        chapter,
        verse: [range.start, range.end] as [number, number],
        reference: `${canonicalBook} ${chapter}` // Keep chapter-only format
      };
      
      // Check for duplicates (including if this chapter was already covered by a chapter:verse ref)
      const isDuplicate = references.some(ref => {
        // Check if same book and chapter
        if (ref.book === canonicalBook && ref.chapter === chapter) {
          return true;
        }
        return false;
      });
      if (!isDuplicate) {
        references.push(reference);
      }
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
  
  // Normalize all dash types (en-dash, em-dash) to regular hyphens and remove spaces
  // "John 3:16 – 17" or "John 3:16—17" → "John 3:16-17"
  normalized = normalized.replace(/(\d+)\s*[-–—]\s*(\d+)/g, '$1-$2');
  
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
    if (/[-–—]/.test(trimmed)) {
      const [start, end] = trimmed.split(/[-–—]/).map(v => parseInt(v.trim()));
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

