import { atom } from 'nanostores';
import { persistentAtom } from 'nanostores/persistent';

// Navigation item interface
export interface NavigationItem {
  id: string;
  title: string;
  type: 'thread' | 'space' | 'note';
  count?: number;
  backgroundGradient?: string;
  color?: string;
  lastAccessed: number; // timestamp
}

// Persistent navigation history store
export const navigationHistory = persistentAtom<NavigationItem[]>('navigation-history', [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

// Add or update an item in navigation history
export function addToNavigationHistory(item: Omit<NavigationItem, 'lastAccessed'>) {
  const currentHistory = navigationHistory.get();
  const now = Date.now();
  
  // Check if item already exists
  const existingIndex = currentHistory.findIndex(historyItem => historyItem.id === item.id);
  
  let updatedHistory: NavigationItem[];
  
  if (existingIndex !== -1) {
    // Item exists - move it to the end (most recent) and update its data
    const existingItem = currentHistory[existingIndex];
    updatedHistory = [
      ...currentHistory.filter((_, index) => index !== existingIndex),
      {
        ...existingItem,
        ...item,
        lastAccessed: now
      }
    ];
  } else {
    // New item - add to the end
    updatedHistory = [
      ...currentHistory,
      {
        ...item,
        lastAccessed: now
      }
    ];
  }
  
  navigationHistory.set(updatedHistory);
  console.log('📚 Navigation history updated:', updatedHistory);
}

// Remove an item from navigation history
export function removeFromNavigationHistory(itemId: string) {
  const currentHistory = navigationHistory.get();
  const updatedHistory = currentHistory.filter(item => item.id !== itemId);
  navigationHistory.set(updatedHistory);
  console.log('🗑️ Removed from navigation history:', itemId);
  console.log('📚 Updated navigation history:', updatedHistory);
}

// Clear all navigation history
export function clearNavigationHistory() {
  navigationHistory.set([]);
  console.log('🧹 Navigation history cleared');
}

// Get navigation history (read-only)
export function getNavigationHistory(): NavigationItem[] {
  return navigationHistory.get();
}

// Check if an item is in navigation history
export function isInNavigationHistory(itemId: string): boolean {
  return navigationHistory.get().some(item => item.id === itemId);
}
