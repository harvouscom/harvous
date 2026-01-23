/**
import { authenticatedFetch } from '@/utils/fetch-helpers';
 * Unified badge count refresh utility
 * Provides verification-based refresh for navigation badge counts
 */

interface NavigationData {
  threads: Array<{ id: string; noteCount: number }>;
  spaces: Array<{ id: string; totalItemCount: number }>;
  inboxCount: number;
}

/**
 * Verify that a badge count matches the expected value by polling the API
 * Uses exponential backoff to handle database replication delays
 */
export async function verifyBadgeCount(
  itemId: string,
  expectedCount: number,
  maxAttempts: number = 3
): Promise<boolean> {
  const delays = [100, 200, 400]; // Exponential backoff in ms
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await authenticatedFetch('/api/navigation/data', {
        credentials: 'include',
        cache: 'no-store'
      });
      
      if (!response.ok) {
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
        continue;
      }
      
      const data: NavigationData = await response.json();
      
      // Check if this is a thread
      if (itemId.startsWith('thread_')) {
        const thread = data.threads.find(t => t.id === itemId);
        if (thread && thread.noteCount === expectedCount) {
          return true; // Count matches
        }
      }
      // Check if this is a space
      else if (itemId.startsWith('space_')) {
        const space = data.spaces.find(s => s.id === itemId);
        if (space && space.totalItemCount === expectedCount) {
          return true; // Count matches
        }
      }
      
      // If not found or count doesn't match, wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
    } catch (error) {
      console.error('[badge-count-refresh] Verification attempt failed:', error);
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
    }
  }
  
  return false; // Failed after all attempts
}

/**
 * Check if a thread/space has recent changes in sessionStorage
 * Returns true if there are recent note creations/deletions for this item
 */
/**
 * PHASE 3: Accepts optional event detail to check first, then falls back to sessionStorage
 */
export function shouldForceRefresh(itemId: string, eventDetail?: { threadId?: string; noteId?: string }): boolean {
  if (typeof window === 'undefined') return false;
  
  // PHASE 3: Check event detail first (primary source)
  if (eventDetail?.threadId && eventDetail.threadId === itemId) {
    return true; // Event indicates this item has a recent change
  }
  
  // Fallback to sessionStorage check (for mount-time and missed events)
  try {
    // Check for recently created notes
    const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
    if (recentNotesStr) {
      const recentNotes = JSON.parse(recentNotesStr);
      const fiveSecondsAgo = Date.now() - 5000;
      
      const hasRecentNote = recentNotes.some((n: any) => 
        n.threadId === itemId && n.timestamp > fiveSecondsAgo
      );
      
      if (hasRecentNote) {
        return true;
      }
    }
    
    // Check for recently deleted notes
    const recentDeletionsStr = sessionStorage.getItem('recentlyDeletedNotes');
    if (recentDeletionsStr) {
      const recentDeletions = JSON.parse(recentDeletionsStr);
      const fiveSecondsAgo = Date.now() - 5000;
      
      const hasRecentDeletion = recentDeletions.some((d: any) => 
        d.threadId === itemId && d.timestamp > fiveSecondsAgo
      );
      
      if (hasRecentDeletion) {
        return true;
      }
    }
  } catch (error) {
    console.error('[badge-count-refresh] Error checking sessionStorage:', error);
  }
  
  return false;
}

/**
 * Track a note deletion in sessionStorage for refresh detection
 */
export function trackNoteDeletion(noteId: string, threadId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const deletionInfo = {
      noteId,
      threadId,
      timestamp: Date.now()
    };
    
    const recentDeletions = JSON.parse(sessionStorage.getItem('recentlyDeletedNotes') || '[]');
    recentDeletions.push(deletionInfo);
    
    // Keep only deletions from last 10 seconds
    const tenSecondsAgo = Date.now() - 10000;
    const filtered = recentDeletions.filter((d: any) => d.timestamp > tenSecondsAgo);
    
    sessionStorage.setItem('recentlyDeletedNotes', JSON.stringify(filtered));
  } catch (error) {
    console.error('[badge-count-refresh] Failed to track note deletion:', error);
  }
}

/**
 * Fetch fresh navigation data from the API
 */
export async function fetchNavigationData(): Promise<NavigationData | null> {
  try {
    const response = await authenticatedFetch('/api/navigation/data', {
      credentials: 'include',
      cache: 'no-store'
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[badge-count-refresh] Error fetching navigation data:', error);
    return null;
  }
}

/**
 * Refresh badge counts with verification
 * Fetches fresh data and verifies counts match expected values
 */
export async function refreshBadgeCountsWithVerification(
  itemId: string,
  expectedCount: number
): Promise<number | null> {
  // First check if we should force refresh (recent changes)
  const forceRefresh = shouldForceRefresh(itemId);
  
  if (forceRefresh) {
    // For recent changes, verify with polling
    const verified = await verifyBadgeCount(itemId, expectedCount, 3);
    if (verified) {
      return expectedCount;
    }
  }
  
  // Fetch fresh data
  const data = await fetchNavigationData();
  if (!data) {
    return null;
  }
  
  // Get the actual count from API
  if (itemId.startsWith('thread_')) {
    const thread = data.threads.find(t => t.id === itemId);
    return thread?.noteCount ?? null;
  } else if (itemId.startsWith('space_')) {
    const space = data.spaces.find(s => s.id === itemId);
    return space?.totalItemCount ?? null;
  }
  
  return null;
}

