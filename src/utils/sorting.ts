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
 * All items are expected to have lastVisited (with fallback set at data source level).
 * This simplifies the sorting logic since we don't need to handle missing lastVisited.
 *
 * The ID tiebreaker ensures deterministic sorting when timestamps are identical.
 * This prevents items from shuffling position on page refresh (common in seed data,
 * migrations, and bulk operations where multiple items get the same millisecond timestamp).
 * All date comparisons use getTime() to avoid string/date mismatches.
 */
export function sortByLastVisited<T extends { 
  lastVisited?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  id?: string;
}>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Primary: Sort by lastVisited (newest first)
    // All items should have lastVisited (with fallback), but handle null/undefined gracefully
    const aLastVisited = a.lastVisited ? normalizeDate(a.lastVisited) : null;
    const bLastVisited = b.lastVisited ? normalizeDate(b.lastVisited) : null;
    
    if (aLastVisited && bLastVisited) {
      const diff = bLastVisited.getTime() - aLastVisited.getTime();
      if (diff !== 0) return diff;
    } else if (aLastVisited && !bLastVisited) {
      return -1; // a has lastVisited, b doesn't - a comes first
    } else if (!aLastVisited && bLastVisited) {
      return 1; // b has lastVisited, a doesn't - b comes first
    }
    
    // Tiebreaker 1: updatedAt (if lastVisited values are equal or both null)
    const aUpdatedAt = a.updatedAt ? normalizeDate(a.updatedAt) : null;
    const bUpdatedAt = b.updatedAt ? normalizeDate(b.updatedAt) : null;
    
    if (aUpdatedAt && bUpdatedAt) {
      const diff = bUpdatedAt.getTime() - aUpdatedAt.getTime();
      if (diff !== 0) return diff;
    } else if (aUpdatedAt && !bUpdatedAt) {
      return -1;
    } else if (!aUpdatedAt && bUpdatedAt) {
      return 1;
    }
    
    // Tiebreaker 2: createdAt (if updatedAt values are equal or both null)
    const aCreatedAt = a.createdAt ? normalizeDate(a.createdAt) : null;
    const bCreatedAt = b.createdAt ? normalizeDate(b.createdAt) : null;
    
    if (aCreatedAt && bCreatedAt) {
      const diff = bCreatedAt.getTime() - aCreatedAt.getTime();
      if (diff !== 0) return diff;
    } else if (aCreatedAt && !bCreatedAt) {
      return -1;
    } else if (!aCreatedAt && bCreatedAt) {
      return 1;
    }
    
    // Final tiebreaker: ID for deterministic sorting
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

