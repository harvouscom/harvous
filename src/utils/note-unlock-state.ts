/**
 * In-memory state manager for unlocked notes.
 *
 * Tracks which notes have been unlocked during the current session,
 * storing the derived encryption key for quick re-encryption on save.
 *
 * Security notes:
 * - Keys exist only in memory (not persisted)
 * - Keys are cleared on page unload or explicit lock
 * - Each note has its own independent unlock state
 */

// Map of noteId -> derived CryptoKey
const unlockedNotes = new Map<string, CryptoKey>();

// Map of noteId -> PIN (for re-encryption with fresh salt/IV)
// We store the PIN temporarily because each save generates a new salt/IV
const notePins = new Map<string, string>();

/**
 * Check if a note is currently unlocked
 */
export function isNoteUnlocked(noteId: string): boolean {
  return unlockedNotes.has(noteId);
}

/**
 * Mark a note as unlocked, storing its derived key and PIN
 *
 * @param noteId - The note ID
 * @param key - The derived CryptoKey from PIN + salt
 * @param pin - The PIN used to derive the key (needed for re-encryption)
 */
export function setNoteUnlocked(noteId: string, key: CryptoKey, pin: string): void {
  unlockedNotes.set(noteId, key);
  notePins.set(noteId, pin);
}

/**
 * Get the stored key for an unlocked note
 */
export function getUnlockKey(noteId: string): CryptoKey | undefined {
  return unlockedNotes.get(noteId);
}

/**
 * Get the stored PIN for an unlocked note (for re-encryption)
 */
export function getUnlockPin(noteId: string): string | undefined {
  return notePins.get(noteId);
}

/**
 * Lock a specific note, clearing its key from memory
 */
export function lockNote(noteId: string): void {
  unlockedNotes.delete(noteId);
  notePins.delete(noteId);
}

/**
 * Lock all notes, clearing all keys from memory
 * Call on logout, page unload, or explicit "lock all" action
 */
export function lockAllNotes(): void {
  unlockedNotes.clear();
  notePins.clear();
}

/**
 * Get the count of currently unlocked notes
 */
export function getUnlockedNoteCount(): number {
  return unlockedNotes.size;
}

/**
 * Get all currently unlocked note IDs
 */
export function getUnlockedNoteIds(): string[] {
  return Array.from(unlockedNotes.keys());
}

// Auto-lock all notes on page unload (browser/tab close)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    lockAllNotes();
  });

  // Also lock on visibility change to hidden (app backgrounded on mobile)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Optional: could implement a timeout before locking
      // For now, keep notes unlocked when app is backgrounded
      // lockAllNotes();
    }
  });
}
