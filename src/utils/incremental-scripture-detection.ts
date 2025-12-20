/**
 * Incremental Scripture Detection Utility
 * 
 * Optimizes scripture detection by:
 * 1. Tracking document state to avoid reprocessing unchanged text
 * 2. Only processing new/changed text segments
 * 3. Merging results with existing pills
 */

interface DocumentState {
  hash: string;
  textLength: number;
  lastProcessedPosition: number;
}

/**
 * Simple hash function for document state
 */
function hashDocument(text: string): string {
  // Simple hash - in production, consider using a more robust hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Track document state for incremental detection
 */
class DocumentStateTracker {
  private state: DocumentState | null = null;

  /**
   * Check if document has changed since last processing
   */
  hasChanged(text: string): boolean {
    if (!this.state) {
      return true; // First time, always process
    }

    const currentHash = hashDocument(text);
    return currentHash !== this.state.hash;
  }

  /**
   * Get text that needs to be processed (new text only)
   */
  getTextToProcess(fullText: string): { text: string; startPosition: number } {
    if (!this.state) {
      // First time - process everything
      this.state = {
        hash: hashDocument(fullText),
        textLength: fullText.length,
        lastProcessedPosition: fullText.length
      };
      return { text: fullText, startPosition: 0 };
    }

    // Check if text was only appended (common case)
    if (fullText.length > this.state.textLength) {
      const newText = fullText.substring(this.state.lastProcessedPosition);
      const startPosition = this.state.lastProcessedPosition;
      
      // Update state
      this.state.hash = hashDocument(fullText);
      this.state.textLength = fullText.length;
      this.state.lastProcessedPosition = fullText.length;
      
      return { text: newText, startPosition };
    }

    // Text was modified (not just appended) - process from a safe position
    // For simplicity, process last 500 characters (where user is likely typing)
    const safeStart = Math.max(0, fullText.length - 500);
    const textToProcess = fullText.substring(safeStart);
    
    // Update state
    this.state.hash = hashDocument(fullText);
    this.state.textLength = fullText.length;
    this.state.lastProcessedPosition = fullText.length;
    
    return { text: textToProcess, startPosition: safeStart };
  }

  /**
   * Reset state (e.g., when document is cleared)
   */
  reset(): void {
    this.state = null;
  }

  /**
   * Get current state (for debugging)
   */
  getState(): DocumentState | null {
    return this.state;
  }
}

// Global tracker instance (one per editor instance)
const trackers = new Map<string, DocumentStateTracker>();

/**
 * Get or create tracker for an editor instance
 */
function getTracker(editorId: string): DocumentStateTracker {
  if (!trackers.has(editorId)) {
    trackers.set(editorId, new DocumentStateTracker());
  }
  return trackers.get(editorId)!;
}

/**
 * Check if document needs processing
 */
export function shouldProcessDocument(editorId: string, text: string): boolean {
  const tracker = getTracker(editorId);
  return tracker.hasChanged(text);
}

/**
 * Get text segment to process (optimized for incremental detection)
 */
export function getTextToProcess(editorId: string, fullText: string): {
  text: string;
  startPosition: number;
  isFullDocument: boolean;
} {
  const tracker = getTracker(editorId);
  const result = tracker.getTextToProcess(fullText);
  
  // If we're processing from position 0, it's the full document
  const isFullDocument = result.startPosition === 0;
  
  return {
    text: result.text,
    startPosition: result.startPosition,
    isFullDocument
  };
}

/**
 * Reset tracker for an editor (e.g., when content is cleared)
 */
export function resetTracker(editorId: string): void {
  const tracker = trackers.get(editorId);
  if (tracker) {
    tracker.reset();
  }
}

/**
 * Clean up tracker (e.g., when editor is destroyed)
 */
export function cleanupTracker(editorId: string): void {
  trackers.delete(editorId);
}

