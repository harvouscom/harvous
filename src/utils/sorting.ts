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
    // Get effective sort time for each item (single computation, no re-normalization)
    // This ensures consistent comparison by computing the sort key once
    const getEffectiveSortTime = (item: T): number => {
      // Try lastVisited first
      if (item.lastVisited) {
        const date = normalizeDate(item.lastVisited);
        if (date) return date.getTime();
      }
      // Fall back to updatedAt
      if (item.updatedAt) {
        const date = normalizeDate(item.updatedAt);
        if (date) return date.getTime();
      }
      // Fall back to createdAt
      if (item.createdAt) {
        const date = normalizeDate(item.createdAt);
        if (date) return date.getTime();
      }
      // No valid date - use 0 (will sort to end)
      return 0;
    };

    const aTime = getEffectiveSortTime(a);
    const bTime = getEffectiveSortTime(b);

    // Primary sort: by effective time (newest first)
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    // Items with valid time come before items without
    if (aTime > 0 && bTime === 0) return -1;
    if (aTime === 0 && bTime > 0) return 1;

    // Final tiebreaker: ID for deterministic sorting
    // Use simple string comparison (not localeCompare) for consistency
    const aId = a.id || '';
    const bId = b.id || '';
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
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

    // Primary sort: by effective time (newest first)
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    // Items with valid time come before items without
    if (aTime > 0 && bTime === 0) return -1;
    if (aTime === 0 && bTime > 0) return 1;

    // Tertiary: ID for deterministic sorting
    // Use simple string comparison (not localeCompare) for consistency
    const aId = a.id || '';
    const bId = b.id || '';
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

