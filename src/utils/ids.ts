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

// Generate a URL-safe share token for public sharing
// Uses Web Crypto API for secure random generation
export function generateShareToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 12; // Short enough for URLs, long enough for uniqueness (62^12 possibilities)
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => alphabet[b % alphabet.length])
    .join('');
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
