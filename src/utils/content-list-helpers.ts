import { normalizeDate } from './sorting';

/**
 * Detect if running in PWA context (app-like display: standalone, fullscreen, or minimal-ui).
 * Single source of truth for PWA vs browser detection.
 */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  const displayModeAppLike =
    window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches;
  const iosStandalone = (window.navigator as any).standalone === true;
  const androidApp = typeof document !== 'undefined' && document.referrer.includes('android-app://');
  return displayModeAppLike || iosStandalone || androidApp;
}

/**
 * Generic function to detect stale data
 * Data is considered stale if:
 * - All items have null lastVisited/lastUpdated, OR
 * - All non-null lastVisited/lastUpdated values are the same
 * 
 * @param items - Array of items with lastVisited or lastUpdated properties
 * @param getDateField - Function to extract the date field from an item (defaults to checking both lastVisited and lastUpdated)
 */
export function isStaleData<T>(
  items: T[],
  getDateField?: (item: T) => Date | string | null | undefined
): boolean {
  if (!items || items.length === 0) return false;
  
  const getDate = getDateField || ((item: T) => {
    const anyItem = item as any;
    return anyItem.lastVisited || anyItem.lastUpdated;
  });
  
  const dateValues = items
    .map(item => getDate(item))
    .filter(val => val != null)
    .map(val => {
      const normalized = normalizeDate(val as Date | string);
      return normalized ? normalized.getTime() : null;
    })
    .filter(val => val != null) as number[];
  
  // If all items have null dates, consider it stale
  if (dateValues.length === 0) return true;
  
  // If all non-null date values are the same, consider it stale
  const uniqueValues = new Set(dateValues);
  if (uniqueValues.size === 1) return true;
  
  return false;
}

/**
 * Normalize date fields in an array of items
 * Handles Date objects, ISO strings, and null/undefined values
 */
export function normalizeItemDates<T extends Record<string, any>>(
  items: T[],
  dateFields: (keyof T)[]
): T[] {
  return items.map(item => {
    const normalized = { ...item };
    dateFields.forEach(field => {
      const value = item[field];
      if (value instanceof Date) {
        // Already a Date, keep as is
        normalized[field] = value as any;
      } else if (value && typeof value === 'string') {
        // ISO string, normalize it
        const normalizedDate = normalizeDate(value);
        normalized[field] = (normalizedDate || value) as any;
      } else if (value) {
        // Try to normalize anyway
        const normalizedDate = normalizeDate(value as any);
        if (normalizedDate) {
          normalized[field] = normalizedDate as any;
        }
      }
    });
    return normalized;
  });
}


