// Navigation state management using URL-based detection
// This approach doesn't rely on global state that gets reset between page requests

export interface ActiveThread {
  id: string;
  title: string;
  color: string;
  noteCount: number;
  backgroundGradient: string;
}

// Sample thread data for navigation
const SAMPLE_THREADS = {
  "thread_1756318000000": {
    id: "thread_1756318000000",
    title: "Gospel of John",
    color: "lovely-lavender",
    noteCount: 2,
    backgroundGradient: "linear-gradient(180deg, var(--color-lovely-lavender) 0%, var(--color-lovely-lavender) 100%)"
  },
  "welcome": {
    id: "welcome",
    title: "Welcome",
    color: "paper",
    noteCount: 3,
    backgroundGradient: "linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)"
  }
};

// Function to get thread context by thread identifier
export function getThreadContext(threadId: string): ActiveThread | null {
  // Map thread identifiers to actual thread data
  const threadMap: Record<string, string> = {
    "gospel-of-john": "thread_1756318000000",
    "welcome": "welcome"
  };
  
  const mappedId = threadMap[threadId];
  if (mappedId && SAMPLE_THREADS[mappedId as keyof typeof SAMPLE_THREADS]) {
    return SAMPLE_THREADS[mappedId as keyof typeof SAMPLE_THREADS];
  }
  
  return null;
}

// Function to detect active thread from current path
// This is more reliable than global state in SSR environments
export function detectActiveThreadFromPath(currentPath: string): ActiveThread | null {
  // Check if we're currently on a thread page
  if (currentPath.includes('/thread_')) {
    const threadId = currentPath.split('/').pop();
    if (threadId && SAMPLE_THREADS[threadId as keyof typeof SAMPLE_THREADS]) {
      return SAMPLE_THREADS[threadId as keyof typeof SAMPLE_THREADS];
    }
  }
  
  // Check if we're currently on a note page that belongs to a thread
  if (currentPath.includes('/note_')) {
    // For now, return the Gospel of John thread as the parent
    // In a real app, this would look up the note's parent thread
    return SAMPLE_THREADS.thread_1756318000000;
  }
  
  // For dashboard and space pages, don't show a specific thread context
  // This allows the mobile navigation to show "For You" as the default
  if (currentPath === '/dashboard' || currentPath.includes('/space_')) {
    return null;
  }
  
  return null;
}

// Legacy functions for compatibility (but they won't work reliably in SSR)
export function getActiveThread(): ActiveThread | null {
  // This won't work reliably in SSR - use detectActiveThreadFromPath instead
  return null;
}

export function setActiveThread(thread: ActiveThread): void {
  // This won't work reliably in SSR - use detectActiveThreadFromPath instead
}

export function clearActiveThread(): void {
  // This won't work reliably in SSR - use detectActiveThreadFromPath instead
}
