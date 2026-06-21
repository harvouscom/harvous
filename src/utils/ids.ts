// Counter to ensure unique timestamps
let lastTimestamp = 0;

// Utility function to generate timestamp-based IDs
export function generateTimestampId(prefix: string): string {
  let timestamp = Date.now();
  
  // Ensure timestamp is unique by incrementing if needed
  if (timestamp <= lastTimestamp) {
    timestamp = lastTimestamp + 1;
  }
  lastTimestamp = timestamp;
  
  return `${prefix}_${timestamp}`;
}

// Specific ID generators for each content type
export function generateSpaceId(): string {
  return generateTimestampId("space");
}

export function generateThreadId(): string {
  return generateTimestampId("thread");
}

export function generateNoteId(): string {
  return generateTimestampId("note");
}

export function generateCommentId(): string {
  return generateTimestampId("comment");
}

/** Server-backed study branch row (native `StudyThread` parity on Postgres). */
export function generateStudyThreadEntryId(): string {
  return generateTimestampId("study");
}

// Function to get the next available simple note ID for adding content from inbox/archive
export function getNextSimpleNoteId(existingNotes: Array<{ noteId?: number }>): number {
  // Find the highest existing simple note ID
  const existingNoteIds = existingNotes
    .filter(note => note.noteId !== undefined)
    .map(note => note.noteId!)
    .sort((a, b) => a - b);
  
  // Generate next sequential ID
  return existingNoteIds.length > 0 ? Math.max(...existingNoteIds) + 1 : 1;
}

// Function to add content from inbox/archive by assigning a simple note ID
export function addContentToUserNotes(content: any, existingNotes: Array<{ noteId?: number }>): any {
  if (content.noteId !== undefined) {
    // Content already has a simple note ID, return as is
    return content;
  }
  
  // Assign the next available simple note ID
  const nextSimpleNoteId = getNextSimpleNoteId(existingNotes);
  return {
    ...content,
    noteId: nextSimpleNoteId
  };
}

export function generateMemberId(): string {
  return generateTimestampId("member");
}

// Shared base62 alphabet (URL-safe, no ambiguous separators).
const BASE62_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Generate a URL-safe share token for public sharing
// Uses Web Crypto API for secure random generation
export function generateShareToken(): string {
  const length = 12; // Short enough for URLs, long enough for uniqueness (62^12 possibilities)
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => BASE62_ALPHABET[b % BASE62_ALPHABET.length])
    .join('');
}

function base62Encode(value: number): string {
  if (value === 0) return BASE62_ALPHABET[0];
  let n = value;
  let out = '';
  while (n > 0) {
    out = BASE62_ALPHABET[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

function base62Decode(slug: string): number {
  let n = 0;
  for (const ch of slug) {
    const idx = BASE62_ALPHABET.indexOf(ch);
    if (idx === -1) return NaN;
    n = n * 62 + idx;
  }
  return n;
}

/**
 * Prototype note URL slug ⇄ note id.
 *
 * Internal note ids stay `note_<timestamp>` (shared with native/offline/classic
 * sync); the prototype URL shows a short, random-looking base62 encoding of the
 * timestamp instead of the raw number. The mapping is reversible and stateless —
 * no DB column. Falls back gracefully for non-timestamp ids and legacy links.
 */
export function encodeNoteSlug(id: string): string {
  const m = /^note_(\d+)$/.exec(id);
  if (!m) return id.startsWith('note_') ? id.slice('note_'.length) : id;
  return base62Encode(Number(m[1]));
}

export function decodeNoteSlug(slug: string): string {
  if (slug.startsWith('note_')) return slug; // already a full id (defensive)
  if (/^\d{11,}$/.test(slug)) return `note_${slug}`; // legacy raw-timestamp URL
  const n = base62Decode(slug);
  if (!Number.isFinite(n) || n <= 0) return `note_${slug}`; // not base62 → passthrough
  return `note_${n}`;
}

// Validate share token format
export function isValidShareToken(token: string): boolean {
  return /^[A-Za-z0-9]{12}$/.test(token);
}

// Helper to extract the prefix from an ID
export function getPrefixFromId(id: string): string {
  return id.split('_')[0];
}

// Helper to check if an ID is valid format
export function isValidId(id: string): boolean {
  return /^[a-z]+_\d+$/.test(id);
}
