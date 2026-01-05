/**
 * Shared sorting utilities that match API sorting logic
 * Used across all list components for consistent sorting behavior
 */

/**
 * Normalize a date value to a Date object or null
 * Handles Date objects, ISO strings, and null/undefined
 */
export function normalizeDate(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Multi-tier sorting: lastVisited → updatedAt → createdAt → id
 * Matches API sorting logic in dashboard-data.ts
 * 
 * This ensures consistent ordering even when items have the same lastVisited timestamp.
 * All date comparisons use getTime() to avoid string/date mismatches.
 */
export function sortByLastVisited<T extends { 
  lastVisited?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  id?: string;
}>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Helper function to get a timestamp as number or null
    // Returns null (not 0) to distinguish between "has no time" and "time is epoch"
    const getSortTime = (item: T): number | null => {
      // Primary: lastVisited
      if (item.lastVisited) {
        const date = normalizeDate(item.lastVisited);
        if (date) return date.getTime();
      }
      // Secondary: updatedAt
      if (item.updatedAt) {
        const date = normalizeDate(item.updatedAt);
        if (date) return date.getTime();
      }
      // Tertiary: createdAt
      if (item.createdAt) {
        const date = normalizeDate(item.createdAt);
        if (date) return date.getTime();
      }
      return null;
    };
    
    const aTime = getSortTime(a);
    const bTime = getSortTime(b);
    
    // Primary sort: lastVisited (newest first)
    if (aTime !== null && bTime !== null) {
      const diff = bTime - aTime;
      if (diff !== 0) return diff; // Different times, use that
    } else if (aTime !== null && bTime === null) {
      return -1; // a has time, b doesn't - a comes first
    } else if (aTime === null && bTime !== null) {
      return 1; // b has time, a doesn't - b comes first
    }
    // Both have no time, continue to quaternary sort
    
    // Quaternary: ID for deterministic sorting
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * For threads with isPinned: isPinned → lastVisited → updatedAt → createdAt → id
 * Matches API sorting logic for threads in dashboard-data.ts
 */
export function sortThreadsByLastVisited<T extends {
  isPinned?: boolean;
  lastVisited?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  id?: string;
}>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Primary: isPinned (pinned items first)
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // Secondary: lastVisited → updatedAt → createdAt
    const getSortTime = (item: T): number => {
      if (item.lastVisited) {
        const date = normalizeDate(item.lastVisited);
        if (date) return date.getTime();
      }
      if (item.updatedAt) {
        const date = normalizeDate(item.updatedAt);
        if (date) return date.getTime();
      }
      if (item.createdAt) {
        const date = normalizeDate(item.createdAt);
        if (date) return date.getTime();
      }
      return 0;
    };
    
    const aTime = getSortTime(a);
    const bTime = getSortTime(b);
    
    if (aTime && bTime) {
      const diff = bTime - aTime;
      if (diff !== 0) return diff;
    } else if (aTime && !bTime) {
      return -1;
    } else if (!aTime && bTime) {
      return 1;
    }
    
    // Tertiary: ID for deterministic sorting
    return (a.id || '').localeCompare(b.id || '');
  });
}

