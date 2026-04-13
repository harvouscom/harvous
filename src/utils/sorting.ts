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
 * Multi-tier sorting: hasLastVisited → lastVisited → updatedAt → createdAt → id
 *
 * CRITICAL: Items with lastVisited ALWAYS sort above items without lastVisited.
 * This ensures that items you've actually visited appear above unvisited items,
 * even if the unvisited items were created more recently.
 *
 * Within visited items: sort by lastVisited (newest first)
 * Within unvisited items: sort by updatedAt → createdAt (newest first)
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
    // Check if items have actual lastVisited values
    const aHasLastVisited = a.lastVisited != null && normalizeDate(a.lastVisited) != null;
    const bHasLastVisited = b.lastVisited != null && normalizeDate(b.lastVisited) != null;

    // Primary: Items with lastVisited sort ABOVE items without
    // This ensures visited items always appear before unvisited items
    if (aHasLastVisited && !bHasLastVisited) return -1;
    if (!aHasLastVisited && bHasLastVisited) return 1;

    // Get effective sort time for each item
    // For visited items: use lastVisited
    // For unvisited items: use updatedAt → createdAt
    const getEffectiveSortTime = (item: T, hasLastVisited: boolean): number => {
      if (hasLastVisited && item.lastVisited) {
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

    const aTime = getEffectiveSortTime(a, aHasLastVisited);
    const bTime = getEffectiveSortTime(b, bHasLastVisited);

    // Secondary sort: by effective time (newest first)
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    // Items with valid time come before items without
    if (aTime > 0 && bTime === 0) return -1;
    if (aTime === 0 && bTime > 0) return 1;

    // Tertiary tiebreaker: When lastVisited timestamps are identical, use updatedAt
    // This provides more stable sorting when items were visited at the exact same millisecond
    const aUpdated = a.updatedAt ? normalizeDate(a.updatedAt)?.getTime() || 0 : 0;
    const bUpdated = b.updatedAt ? normalizeDate(b.updatedAt)?.getTime() || 0 : 0;
    if (aUpdated !== bUpdated) {
      return bUpdated - aUpdated;
    }

    // Quaternary tiebreaker: When updatedAt is also identical, use createdAt
    const aCreated = a.createdAt ? normalizeDate(a.createdAt)?.getTime() || 0 : 0;
    const bCreated = b.createdAt ? normalizeDate(b.createdAt)?.getTime() || 0 : 0;
    if (aCreated !== bCreated) {
      return bCreated - aCreated;
    }

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
 * For threads with isPinned: isPinned → hasLastVisited → lastVisited → updatedAt → createdAt → id
 * Matches API sorting logic for threads in dashboard-data.ts
 *
 * CRITICAL: Pinned items first, then items with lastVisited above items without.
 * This ensures visited threads appear above unvisited threads.
 */
/**
 * Oldest first by createdAt, then id — for curated / shared space lists and chronological space views.
 */
export function sortByCreatedAtAsc<T extends { createdAt?: Date | string | null; id?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdAt ? normalizeDate(a.createdAt)?.getTime() ?? 0 : 0;
    const bTime = b.createdAt ? normalizeDate(b.createdAt)?.getTime() ?? 0 : 0;
    if (aTime !== bTime) return aTime - bTime;
    const aId = a.id || '';
    const bId = b.id || '';
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

/**
 * Onboarding pack notes are inserted with the same `createdAt` for every row, so created-time sort
 * ties and falls back to random `id` order. Pack order is `simpleNoteId` (1 = first markdown, etc.).
 */
export function sortOnboardingThreadNotes<
  T extends { simpleNoteId?: number | null; createdAt?: Date | string | null; id?: string },
>(items: T[]): T[] {
  const rank = (n: number | null | undefined) =>
    n != null && n > 0 ? n : Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => {
    const aR = rank(a.simpleNoteId);
    const bR = rank(b.simpleNoteId);
    if (aR !== bR) return aR - bR;
    const aTime = a.createdAt ? normalizeDate(a.createdAt)?.getTime() ?? 0 : 0;
    const bTime = b.createdAt ? normalizeDate(b.createdAt)?.getTime() ?? 0 : 0;
    if (aTime !== bTime) return aTime - bTime;
    const aId = a.id || '';
    const bId = b.id || '';
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

/**
 * Shared / public space thread list: pinned first, then oldest thread first.
 */
export function sortThreadsChronologicallyForSpace<
  T extends { isPinned?: boolean; createdAt?: Date | string | null; id?: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const aTime = a.createdAt ? normalizeDate(a.createdAt)?.getTime() ?? 0 : 0;
    const bTime = b.createdAt ? normalizeDate(b.createdAt)?.getTime() ?? 0 : 0;
    if (aTime !== bTime) return aTime - bTime;
    const aId = a.id || '';
    const bId = b.id || '';
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

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

    // Check if items have actual lastVisited values
    const aHasLastVisited = a.lastVisited != null && normalizeDate(a.lastVisited) != null;
    const bHasLastVisited = b.lastVisited != null && normalizeDate(b.lastVisited) != null;

    // Secondary: Items with lastVisited sort ABOVE items without
    // This ensures visited items always appear before unvisited items
    if (aHasLastVisited && !bHasLastVisited) return -1;
    if (!aHasLastVisited && bHasLastVisited) return 1;

    // Get effective sort time for each item
    const getSortTime = (item: T, hasLastVisited: boolean): number => {
      if (hasLastVisited && item.lastVisited) {
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

    const aTime = getSortTime(a, aHasLastVisited);
    const bTime = getSortTime(b, bHasLastVisited);

    // Tertiary sort: by effective time (newest first)
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    // Items with valid time come before items without
    if (aTime > 0 && bTime === 0) return -1;
    if (aTime === 0 && bTime > 0) return 1;

    // Quaternary tiebreaker: When lastVisited timestamps are identical, use updatedAt
    // This provides more stable sorting when items were visited at the exact same millisecond
    const aUpdated = a.updatedAt ? normalizeDate(a.updatedAt)?.getTime() || 0 : 0;
    const bUpdated = b.updatedAt ? normalizeDate(b.updatedAt)?.getTime() || 0 : 0;
    if (aUpdated !== bUpdated) {
      return bUpdated - aUpdated;
    }

    // Quinary tiebreaker: When updatedAt is also identical, use createdAt
    const aCreated = a.createdAt ? normalizeDate(a.createdAt)?.getTime() || 0 : 0;
    const bCreated = b.createdAt ? normalizeDate(b.createdAt)?.getTime() || 0 : 0;
    if (aCreated !== bCreated) {
      return bCreated - aCreated;
    }

    // Final tiebreaker: ID for deterministic sorting
    // Use simple string comparison (not localeCompare) for consistency
    const aId = a.id || '';
    const bId = b.id || '';
    if (aId < bId) return -1;
    if (aId > bId) return 1;
    return 0;
  });
}

