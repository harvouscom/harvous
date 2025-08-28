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

export function generateMemberId(): string {
  return generateTimestampId("member");
}

// Helper to extract the prefix from an ID
export function getPrefixFromId(id: string): string {
  return id.split('_')[0];
}

// Helper to check if an ID is valid format
export function isValidId(id: string): boolean {
  return /^[a-z]+_\d+$/.test(id);
}
