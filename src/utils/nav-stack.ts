/**
 * Navigation stack for breadcrumb-style back navigation within threads.
 *
 * When navigating from Note A → Note B (via scripture pill or note link),
 * push Note A onto the stack. When the user clicks the thread/back button,
 * pop the stack to go back to Note A instead of jumping to the thread.
 *
 * Stored in sessionStorage (clears on tab close — stale breadcrumbs
 * from old sessions shouldn't persist).
 */

import { idToUrl, getFromNoteId } from './url-helpers';

const STORAGE_KEY = 'harvous-nav-stack';
const MAX_ENTRIES = 10;
const STALE_MS = 30 * 60 * 1000; // 30 minutes

export interface NavStackEntry {
  noteId: string;    // "note_abc123" — the note we came FROM
  threadId: string;  // "thread_xyz" — scoping key
  timestamp: number;
}

function readStack(): NavStackEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    // Filter out stale and invalid entries
    return parsed.filter(
      (e: any) =>
        e &&
        typeof e.noteId === 'string' &&
        typeof e.threadId === 'string' &&
        typeof e.timestamp === 'number' &&
        now - e.timestamp < STALE_MS
    );
  } catch {
    return [];
  }
}

function writeStack(stack: NavStackEntry[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.slice(-MAX_ENTRIES)));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

/** Push the current note onto the stack before navigating deeper. */
export function pushNavStack(noteId: string, threadId: string): void {
  if (!noteId || !threadId) return;
  const stack = readStack();
  // Avoid duplicate consecutive entries (e.g. double-click)
  const top = stack[stack.length - 1];
  if (top && top.noteId === noteId && top.threadId === threadId) return;
  stack.push({ noteId, threadId, timestamp: Date.now() });
  writeStack(stack);
}

/** Pop the top entry for the given thread. Returns the entry or null. */
export function popNavStack(threadId: string): NavStackEntry | null {
  const stack = readStack();
  // Find the last entry for this thread
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].threadId === threadId) {
      const [entry] = stack.splice(i, 1);
      writeStack(stack);
      return entry;
    }
  }
  return null;
}

/** Peek at the top entry for the given thread without removing it. */
export function peekNavStack(threadId: string): NavStackEntry | null {
  const stack = readStack();
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].threadId === threadId) {
      return stack[i];
    }
  }
  return null;
}

/** Clear the stack, optionally scoped to a specific thread. */
export function clearNavStack(threadId?: string): void {
  if (!threadId) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    return;
  }
  const stack = readStack().filter((e) => e.threadId !== threadId);
  writeStack(stack);
}

/**
 * Get the URL to navigate "back" to from the current note.
 * Priority:
 * 1. Nav stack entry for this thread
 * 2. ?from= URL parameter (survives page refresh)
 * 3. Thread URL (default)
 */
export function getBackTarget(currentNoteId: string, threadId: string, spaceId?: string | null): string {
  // 1. Check nav stack
  const stackEntry = peekNavStack(threadId);
  if (stackEntry && stackEntry.noteId !== currentNoteId) {
    return idToUrl(stackEntry.noteId, threadId);
  }

  // 2. Check ?from= URL parameter
  const fromParam = getFromNoteId();
  if (fromParam && fromParam !== currentNoteId) {
    return idToUrl(fromParam, threadId);
  }

  // 3. Fall back to thread URL
  const threadUrl = idToUrl(threadId);
  if (spaceId && typeof spaceId === 'string' && spaceId.startsWith('space_')) {
    return `${threadUrl}?space=${encodeURIComponent(spaceId)}`;
  }
  return threadUrl;
}
