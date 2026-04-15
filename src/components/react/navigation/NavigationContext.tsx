import React, { createContext, use, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { safeSetItem, safeGetItem } from '@/utils/safe-storage';
import { safeFetch, isAuthReady } from '@/utils/safe-fetch';
import { idToUrl, extractIdFromPath, detectEntityTypeFromPath } from '@/utils/url-helpers';
import { shouldForceRefresh, trackNoteDeletion, refreshBadgeCountsWithVerification } from '@/utils/badge-count-refresh';
import { getSelectedSpaceId, setSelectedSpaceId } from './selectedSpace';
import { getSpaceIdForImplicitHistoryScope } from '@/utils/current-space-for-links';
import { clearNavStack } from '@/utils/nav-stack';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';

// Navigation item interface
export interface NavigationItem {
  id: string;
  title: string;
  count?: number;
  backgroundGradient?: string;
  spaceId?: string | null;
  // The selected space context when this item was opened.
  // This enables per-space persistence independent of the thread's actual space.
  //
  // Multi-scope: a thread can be opened from multiple spaces; it should persist in each
  // until explicitly closed. `null` represents “My Home”.
  openedInSpaceIds?: Array<string | null>;
  // Legacy single-scope field (back-compat)
  openedInSpaceId?: string | null;
  firstAccessed: number;
  lastAccessed: number;
}

// Options for removeFromNavigationHistory (e.g. erase: update history only, caller navigates)
export interface RemoveFromNavigationHistoryOptions {
  navigateIfActive?: boolean;
  /** When closing a thread, remove all threads with this title from history so the thread disappears from nav */
  sameTitleAs?: string;
  /**
   * Current sidebar/route space to remove from `openedInSpaceIds` only (multi-scope threads).
   * Use `null` for My Home. When set, other scopes are preserved unless this was the last scope.
   */
  fromSpaceId?: string | null;
}

// Navigation context interface
interface NavigationContextType {
  navigationHistory: NavigationItem[];
  addToNavigationHistory: (item: Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'>) => void;
  removeFromNavigationHistory: (itemId: string, options?: RemoveFromNavigationHistoryOptions) => void;
  trackNavigationAccess: () => void;
  refreshNavigation: () => void;
  getCurrentActiveItemId: () => string;
  updateNavigationItemCount: (itemId: string, count: number) => void;
}

// Create the context with default SSR-safe values
const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Default context value for SSR
const defaultContextValue: NavigationContextType = {
  navigationHistory: [],
  addToNavigationHistory: () => {},
  removeFromNavigationHistory: () => {},
  trackNavigationAccess: () => {},
  refreshNavigation: () => {},
  getCurrentActiveItemId: () => '',
  updateNavigationItemCount: () => {},
};

// Home-only threads — these must never have space scopes in openedInSpaceIds.
const isHomeOnlyThread = (id: string): boolean =>
  id === 'thread_unorganized' || id.startsWith('thread_onboarding_');

// Provider component
export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const normalizeOpenedInSpaceId = (value: unknown): string | null => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed || trimmed === 'home') return null;
    const withoutLeading = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const withoutTrailing = withoutLeading.endsWith('/') ? withoutLeading.slice(0, -1) : withoutLeading;
    const normalized = withoutTrailing || null;
    if (!normalized) return null;
    // Only accept real space ids; everything else is treated as Home.
    if (normalized.startsWith('space_')) return normalized;
    return null;
  };

  const getItemOpenedInSpaceIds = (item: Partial<NavigationItem>): Array<string | null> => {
    const fromArray = Array.isArray((item as any).openedInSpaceIds) ? ((item as any).openedInSpaceIds as Array<unknown>) : null;
    if (fromArray) {
      const normalized = fromArray.map(normalizeOpenedInSpaceId);
      // Keep nulls (Home) and dedupe while preserving order
      const seen = new Set<string>();
      const out: Array<string | null> = [];
      for (const s of normalized) {
        const key = s ?? 'home';
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
      return out.length > 0 ? out : [null];
    }

    const legacy = normalizeOpenedInSpaceId((item as any).openedInSpaceId ?? null);
    if (legacy !== null) return [legacy];

    // Back-compat fallback: if openedInSpaceId missing, use thread's actual spaceId (or Home).
    const fromSpaceId = normalizeOpenedInSpaceId((item as any).spaceId ?? null);
    return [fromSpaceId];
  };

  const mergeOpenedInSpaceIds = (
    existing: Array<string | null>,
    additions: Array<string | null>
  ): Array<string | null> => {
    const seen = new Set<string>();
    const out: Array<string | null> = [];
    const push = (s: string | null) => {
      const key = s ?? 'home';
      if (seen.has(key)) return;
      seen.add(key);
      out.push(s);
    };
    for (const s of existing) push(normalizeOpenedInSpaceId(s));
    for (const s of additions) push(normalizeOpenedInSpaceId(s));
    return out.length > 0 ? out : [null];
  };

  // Both the closed-items list AND navigation history MUST use window.localStorage directly.
  // safeGetItem/safeSetItem use getStorage() which does a test-write on every call; near quota
  // the test fails and I/O bounces to sessionStorage. This creates a split-brain where writes
  // go to sessionStorage while reads hit stale localStorage, resurrecting closed items.
  const CLOSED_NAV_KEY = 'harvous-closed-navigation-items';
  const NAV_HISTORY_KEY = 'harvous-navigation-history-v2';
  /** Written alongside nav history in whichever tier holds the blob; used to pick the newer copy on read. */
  const NAV_WRITE_TS_KEY = 'harvous-nav-write-ts';

  /** Read nav history JSON. When both tiers have data, compare write timestamps so a fresh
   *  sessionStorage fallback (after local quota) is not discarded in favor of stale localStorage. */
  const readNavHistoryRaw = (): string | null => {
    const parseTs = (s: string | null): number => {
      if (s == null || s === '') return 0;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    };
    try {
      let fromLocal: string | null = null;
      let fromSession: string | null = null;
      try {
        fromLocal = window.localStorage.getItem(NAV_HISTORY_KEY);
      } catch {
        /* ignore */
      }
      try {
        fromSession = window.sessionStorage?.getItem(NAV_HISTORY_KEY) ?? null;
      } catch {
        /* ignore */
      }

      if (!fromLocal?.length && !fromSession?.length) return null;

      const tsLocal = parseTs(window.localStorage.getItem(NAV_WRITE_TS_KEY));
      const tsSession = parseTs(window.sessionStorage?.getItem(NAV_WRITE_TS_KEY));

      if (fromLocal?.length && !fromSession?.length) {
        try {
          window.sessionStorage?.removeItem(NAV_HISTORY_KEY);
          window.sessionStorage?.removeItem(NAV_WRITE_TS_KEY);
        } catch {
          /* ignore */
        }
        return fromLocal;
      }
      if (!fromLocal?.length && fromSession?.length) {
        try {
          window.localStorage.setItem(NAV_HISTORY_KEY, fromSession);
          window.localStorage.setItem(NAV_WRITE_TS_KEY, String(tsSession || Date.now()));
          window.sessionStorage.removeItem(NAV_HISTORY_KEY);
          window.sessionStorage.removeItem(NAV_WRITE_TS_KEY);
        } catch {
          /* quota still full, keep session copy */
        }
        return fromSession;
      }

      // both exist — pick newer write
      if (tsSession > tsLocal) {
        try {
          window.localStorage.setItem(NAV_HISTORY_KEY, fromSession!);
          window.localStorage.setItem(NAV_WRITE_TS_KEY, String(tsSession));
          window.sessionStorage.removeItem(NAV_HISTORY_KEY);
          window.sessionStorage.removeItem(NAV_WRITE_TS_KEY);
        } catch {
          /* keep session */
        }
        return fromSession;
      }

      try {
        window.sessionStorage?.removeItem(NAV_HISTORY_KEY);
        window.sessionStorage?.removeItem(NAV_WRITE_TS_KEY);
      } catch {
        /* ignore */
      }
      return fromLocal;
    } catch {
      return null;
    }
  };

  /** Write nav history JSON to localStorage with quota-recovery (trim + retry). */
  const writeNavHistory = (json: string): boolean => {
    const ts = String(Date.now());
    const clearSessionFallback = () => {
      try {
        window.sessionStorage?.removeItem(NAV_HISTORY_KEY);
        window.sessionStorage?.removeItem(NAV_WRITE_TS_KEY);
      } catch {
        /* ignore */
      }
    };
    try {
      window.localStorage.setItem(NAV_HISTORY_KEY, json);
      window.localStorage.setItem(NAV_WRITE_TS_KEY, ts);
      clearSessionFallback();
      return true;
    } catch {
      try {
        // Trim nav history to free space, then retry
        const old = window.localStorage.getItem(NAV_HISTORY_KEY);
        if (old) {
          const arr: unknown = JSON.parse(old);
          if (Array.isArray(arr) && arr.length > 3) {
            window.localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(arr.slice(-3)));
          }
        }
        window.localStorage.setItem(NAV_HISTORY_KEY, json);
        window.localStorage.setItem(NAV_WRITE_TS_KEY, ts);
        clearSessionFallback();
        return true;
      } catch {
        // Last resort: sessionStorage so the current session isn't broken
        try {
          window.sessionStorage?.setItem(NAV_HISTORY_KEY, json);
          window.sessionStorage?.setItem(NAV_WRITE_TS_KEY, ts);
        } catch {
          /* ignore */
        }
        return false;
      }
    }
  };

  const getClosedItems = (): string[] => {
    if (typeof window === 'undefined') {
      return [];
    }
    const ids = new Set<string>();
    // Merge from both tiers — addToClosedItems can fall back to sessionStorage when
    // localStorage is full, so either tier may hold the most recent copy.
    try {
      const fromLocal = window.localStorage.getItem(CLOSED_NAV_KEY);
      if (fromLocal) {
        const p: unknown = JSON.parse(fromLocal);
        if (Array.isArray(p)) p.forEach((x) => { if (typeof x === 'string') ids.add(x); });
      }
    } catch { /* ignore */ }
    try {
      const fromSession = window.sessionStorage?.getItem(CLOSED_NAV_KEY);
      if (fromSession) {
        const p: unknown = JSON.parse(fromSession);
        if (Array.isArray(p)) p.forEach((x) => { if (typeof x === 'string') ids.add(x); });
        // Promote merged set to localStorage so it survives a refresh
        const merged = [...ids];
        try { window.localStorage.setItem(CLOSED_NAV_KEY, JSON.stringify(merged)); window.sessionStorage.removeItem(CLOSED_NAV_KEY); } catch { /* quota still full */ }
      }
    } catch { /* ignore */ }
    return [...ids];
  };

  const addToClosedItems = (itemId: string) => {
    if (typeof window === 'undefined') {
      return;
    }
    const closedItems = getClosedItems();
    if (closedItems.includes(itemId)) {
      return;
    }
    closedItems.push(itemId);
    const json = JSON.stringify(closedItems);
    try {
      window.localStorage.setItem(CLOSED_NAV_KEY, json);
    } catch {
      try {
        const h = window.localStorage.getItem(NAV_HISTORY_KEY);
        if (h) {
          const arr: unknown = JSON.parse(h);
          if (Array.isArray(arr) && arr.length > 3) {
            window.localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(arr.slice(-3)));
          }
        }
        window.localStorage.setItem(CLOSED_NAV_KEY, json);
      } catch {
        try {
          window.localStorage.removeItem(NAV_HISTORY_KEY);
          try {
            window.localStorage.removeItem(NAV_WRITE_TS_KEY);
          } catch {
            /* ignore */
          }
          window.localStorage.setItem(CLOSED_NAV_KEY, json);
        } catch {
          try {
            window.sessionStorage?.setItem(CLOSED_NAV_KEY, json);
          } catch {
            /* ignore */
          }
        }
      }
    }
  };

  const removeFromClosedItems = (itemId: string) => {
    if (typeof window === 'undefined') {
      return;
    }
    const closedItems = getClosedItems();
    const filtered = closedItems.filter((id) => id !== itemId);
    if (filtered.length === closedItems.length) {
      return;
    }
    try {
      window.localStorage.setItem(CLOSED_NAV_KEY, JSON.stringify(filtered));
    } catch {
      /* ignore */
    }
    try {
      window.sessionStorage?.removeItem(CLOSED_NAV_KEY);
    } catch {
      /* ignore */
    }
  };

  const isItemClosed = (itemId: string): boolean => {
    if (typeof window === 'undefined') {
      return false;
    }
    return getClosedItems().includes(itemId);
  };

  // IMPORTANT: start empty for SSR + first client render to avoid hydration mismatches.
  // We load from storage after mount in the initialization effect below.
  const [navigationHistory, setNavigationHistory] = useState<NavigationItem[]>([]);

  // Get navigation history from storage
  const getNavigationHistory = (): NavigationItem[] => {
    // Handle SSR - return empty array if not in browser
    if (typeof window === 'undefined') {
      return [];
    }
    
    try {
      const stored = readNavHistoryRaw();
      
      let parsed = stored ? JSON.parse(stored) : [];
      let needsMigration = false;
      
      // Defensive: ensure parsed is an array
      // Handle both array format and object with items property (backward compatibility)
      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
          // Old format: {items: [...]} - extract the array and migrate
          console.warn('[NavigationContext] Navigation history is in old format, migrating to new format');
          parsed = parsed.items;
          needsMigration = true;
        } else {
          console.warn('[NavigationContext] Navigation history is not an array, defaulting to empty array:', parsed);
          parsed = [];
          needsMigration = true;
        }
      }
      
      // Migrate to new format if needed (save back as direct array)
      if (needsMigration) {
        writeNavHistory(JSON.stringify(parsed));
      }
      
      // If localStorage is empty but we have a backup, use it
      if (parsed.length === 0 && (window as any).navigationHistoryBackup && Array.isArray((window as any).navigationHistoryBackup) && (window as any).navigationHistoryBackup.length > 0) {
        parsed = (window as any).navigationHistoryBackup;
      }

      // REMOVED: sessionStorage fallback mechanism
      // The sessionStorage 'harvous-pending-thread' fallback has been removed because:
      // 1. NavigationContext.handleNoteCreated now handles all thread additions after note creation
      // 2. The fallback was causing duplication during page transitions
      // 3. No code writes to 'harvous-pending-thread' anymore, so this is dead code
      // Clean up any stale sessionStorage data
      try {
        sessionStorage.removeItem('harvous-pending-thread');
      } catch (error) {
        // Silently fail if sessionStorage is not available
      }
      
      // Normalize opened-in scopes (multi-scope migration + back-compat).
      // If we had to normalize anything, persist back to storage.
      const normalizedItems = (parsed as any[]).map((raw) => {
        const item = raw as NavigationItem;
        const openedInSpaceIds = getItemOpenedInSpaceIds(item);
        const hasArray = Array.isArray((item as any).openedInSpaceIds);
        const arrayMatches =
          hasArray &&
          JSON.stringify((item as any).openedInSpaceIds) === JSON.stringify(openedInSpaceIds);

        if (!hasArray || !arrayMatches) {
          needsMigration = true;
        }

        // Keep legacy single value around for older consumers (use the most recent added scope if present)
        const legacyOpenedIn = normalizeOpenedInSpaceId((item as any).openedInSpaceId ?? null);

        return {
          ...item,
          openedInSpaceIds,
          openedInSpaceId: legacyOpenedIn,
        } as NavigationItem;
      });

      if (needsMigration) {
        writeNavHistory(JSON.stringify(normalizedItems));
      }

      // Filter out specific test items (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredItems = normalizedItems.filter((item: NavigationItem) => {
        if (testItemTitles.includes(item.title)) return false;
        if (typeof item.id === 'string' && item.id.startsWith('space_')) return false;
        if (isItemClosed(item.id)) return false;
        return true;
      });

      // Dedupe by id so we never expose duplicate entries (e.g. from races on note create)
      const deduped = filteredItems.reduce((acc: NavigationItem[], current: NavigationItem) => {
        const existingItem = acc.find((item) => item.id === current.id);
        if (!existingItem) {
          acc.push(current);
        } else if ((current.lastAccessed ?? 0) > (existingItem.lastAccessed ?? 0)) {
          const index = acc.findIndex((item) => item.id === current.id);
          acc[index] = current;
        }
        return acc;
      }, []);

      return deduped;
    } catch (error) {
      console.error('Error getting navigation history:', error);
      const backup = (window as any).navigationHistoryBackup || [];
      
      // Defensive: ensure backup is an array
      const safeBackup = Array.isArray(backup) ? backup : [];
      
      // Filter out specific test items from backup too (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredBackup = safeBackup.filter((item: NavigationItem) => {
        if (testItemTitles.includes(item.title)) return false;
        if (typeof item.id === 'string' && item.id.startsWith('space_')) return false;
        if (isItemClosed(item.id)) return false;
        return true;
      });

      const dedupedBackup = filteredBackup.reduce((acc: NavigationItem[], current: NavigationItem) => {
        const existingItem = acc.find((item) => item.id === current.id);
        if (!existingItem) {
          acc.push(current);
        } else if ((current.lastAccessed ?? 0) > (existingItem.lastAccessed ?? 0)) {
          const index = acc.findIndex((item) => item.id === current.id);
          acc[index] = current;
        }
        return acc;
      }, []);

      return dedupedBackup;
    }
  };

  // Save navigation history to storage
  const saveNavigationHistory = (history: NavigationItem[]) => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    // Strip items the user has closed from the persisted raw data (defense-in-depth).
    // Many code paths read rawHistory, modify one entry, and save the whole array back.
    // If the read hit a stale localStorage copy (safeGetItem can bounce between localStorage
    // and sessionStorage depending on quota), closed items may have been resurrected in the
    // array. Filtering them here ensures they never survive a save regardless of origin.
    // Exception: thread_unorganized is kept even when closed (count 0) to preserve position.
    const closedIds = getClosedItems();
    const withoutClosed =
      closedIds.length > 0
        ? history.filter(
            (item: any) =>
              !item?.id || item.id === 'thread_unorganized' || !closedIds.includes(item.id)
          )
        : history;

    // Dedupe by id so we never persist duplicate entries (e.g. from races on note create)
    const deduped = withoutClosed.reduce((acc: NavigationItem[], current: NavigationItem) => {
      const existingItem = acc.find((item) => item.id === current.id);
      if (!existingItem) {
        acc.push(current);
      } else if ((current.lastAccessed ?? 0) > (existingItem.lastAccessed ?? 0)) {
        const index = acc.findIndex((item) => item.id === current.id);
        acc[index] = current;
      }
      return acc;
    }, []);

    try {
      const jsonString = JSON.stringify(deduped);
      writeNavHistory(jsonString);

      // Also update the backup
      (window as any).navigationHistoryBackup = [...deduped];
    } catch (error) {
      console.error('Error saving navigation history:', error);
    }
  };

  // Add item to navigation history
  const addToNavigationHistory = (item: Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'>) => {
    // Spaces should not appear as persistent nav buttons; they live only in the space switcher dropdown.
    if (item.id.startsWith('space_')) {
      return;
    }

    // Skip specific test items (exact title matches only)
    const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    if (testItemTitles.includes(item.title)) {
      return;
    }

    // saveNavigationHistory strips rows whose ids are still in harvous-closed-navigation-items.
    // Only clear the closed bit when this add is for the thread the user is actually viewing —
    // same rules as trackNavigationAccess isCurrentlyActive (lines ~1199–1204). Otherwise
    // background callers (noteCount refetch, etc.) would wrongly reopen dismissed threads.
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const pathSegmentId =
        extractIdFromPath(currentPath) ?? (currentPath.startsWith('/') ? currentPath.substring(1) : currentPath);
      const currentActiveItemId = getCurrentActiveItemId();
      const viewingThisThread =
        item.id === currentActiveItemId ||
        (pathSegmentId.startsWith('note_') && item.id.startsWith('thread_'));
      if (viewingThisThread) {
        removeFromClosedItems(item.id);
      }
    }

    // Use raw history so we preserve spaces when saving (getNavigationHistory filters out spaces)
    const rawHistory = getRawNavigationHistory();

    // Check if item already exists - use strict equality check
    const existingIndex = rawHistory.findIndex((h: any) => h.id === item.id);

    const hasExplicitOpenedInSpaceIds =
      (item as any).openedInSpaceIds !== undefined && Array.isArray((item as any).openedInSpaceIds);
    // URL-only space (null = no URL evidence, NOT "Home"). Only a real space_* value
    // should be merged; null must NOT be treated as the Home scope here because
    // callers already pass [null] explicitly when the user is on the dashboard.
    const implicitScope = getSpaceIdForImplicitHistoryScope();

    if (existingIndex !== -1) {
      // Item already exists - update lastAccessed time but keep position; never overwrite a positive count with 0 so badge persists
      const existingItem = rawHistory[existingIndex];
      const preservedFirstAccessed = (existingItem.firstAccessed != null) ? existingItem.firstAccessed : Date.now();
      const incomingCount = (item as any).count != null ? Number((item as any).count) : undefined;
      const preservedCount = typeof incomingCount === 'number' && incomingCount > 0
        ? incomingCount
        : ((existingItem as any).count != null ? (existingItem as any).count : (item as any).count);
      const existingTitle = (existingItem as any).title as string | undefined;
      const incomingTitle = item.title;
      const preservedTitle =
        incomingTitle === 'Thread' && existingTitle && existingTitle !== 'Thread' && existingTitle !== ''
          ? existingTitle
          : incomingTitle;
      const existingGrad = (existingItem as any).backgroundGradient as string | undefined;
      const incomingGrad = (item as any).backgroundGradient as string | undefined;
      const defaultGrads = new Set(['var(--color-gradient-gray)', 'var(--color-paper)', '', undefined, null]);
      const preservedGradient =
        defaultGrads.has(incomingGrad as any) && existingGrad && !defaultGrads.has(existingGrad as any)
          ? existingGrad
          : incomingGrad;
      // Home-only threads (onboarding, My Pile) must never accumulate space scopes.
      const forceHomeOnly = isHomeOnlyThread(item.id);
      rawHistory[existingIndex] = {
        ...existingItem,
        ...item,
        title: preservedTitle,
        backgroundGradient: preservedGradient,
        count: preservedCount,
        openedInSpaceIds: forceHomeOnly
          ? [null]
          : (() => {
              const existingScopes = getItemOpenedInSpaceIds(existingItem);
              const callerScopes = hasExplicitOpenedInSpaceIds
                ? getItemOpenedInSpaceIds(item)
                : [];
              // Only merge implicitScope when the URL proves a real space (space_*).
              // null means "no URL evidence" — callers already pass [null] for Home.
              const additions = implicitScope != null
                ? [...callerScopes, implicitScope]
                : callerScopes;
              return additions.length > 0
                ? mergeOpenedInSpaceIds(existingScopes, additions)
                : existingScopes;
            })(),
        openedInSpaceId: forceHomeOnly ? null : normalizeOpenedInSpaceId(
          (item as any).openedInSpaceId ?? (implicitScope != null ? implicitScope : null)
        ),
        firstAccessed: preservedFirstAccessed,
        lastAccessed: Date.now()
      };
    } else {
      // Item doesn't exist - add to the end (first time opening behavior).
      const forceHomeOnly = isHomeOnlyThread(item.id);
      // For new items, trust the caller's explicit scopes; supplement with
      // implicitScope only when it proves a real space and the caller didn't provide scopes.
      const newItemScopes = forceHomeOnly
        ? [null]
        : hasExplicitOpenedInSpaceIds
          ? getItemOpenedInSpaceIds(item)
          : (implicitScope != null
              ? mergeOpenedInSpaceIds(getItemOpenedInSpaceIds(item), [implicitScope])
              : getItemOpenedInSpaceIds(item));
      const newItem: NavigationItem = {
        ...item,
        openedInSpaceIds: newItemScopes,
        openedInSpaceId: forceHomeOnly ? null : normalizeOpenedInSpaceId(
          (item as any).openedInSpaceId ?? (implicitScope != null ? implicitScope : null)
        ),
        firstAccessed: Date.now(),
        lastAccessed: Date.now()
      };
      rawHistory.push(newItem);
    }

    // Sort by firstAccessed to maintain chronological order (full list: threads + spaces)
    rawHistory.sort((a: any, b: any) => {
      const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
      const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });

    // Remove any duplicates by ID (defensive programming)
    const uniqueHistory = rawHistory.reduce((acc: any[], current: any) => {
      const existing = acc.find((i: any) => i.id === current.id);
      if (!existing) {
        acc.push(current);
      } else if ((current.lastAccessed ?? 0) > (existing.lastAccessed ?? 0)) {
        const index = acc.findIndex((i: any) => i.id === current.id);
        acc[index] = current;
      }
      return acc;
    }, []);

    uniqueHistory.sort((a: any, b: any) => {
      const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
      const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });

    // Limit to 10 items, keeping the most recently accessed (full list so spaces are preserved)
    const limitedHistory = uniqueHistory.length > 10 ? uniqueHistory.slice(0, 10) : uniqueHistory;

    saveNavigationHistory(limitedHistory);
    setNavigationHistory(getNavigationHistory());

    // CRITICAL: Dispatch custom event to notify PersistentNavigation to refresh
    // This is needed because React Context updates don't reliably propagate during View Transitions
    // Use setTimeout to ensure child components have mounted and set up their event listeners
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      }, 0);
    }
  };

  // Update the count for a specific navigation item directly in rawHistory.
  // Used by NavigationColumn to sync API-fetched counts back to history.
  const updateNavigationItemCount = (itemId: string, newCount: number) => {
    const rawHistory = getRawNavigationHistory();
    const idx = rawHistory.findIndex((h: any) => h.id === itemId);
    if (idx !== -1 && rawHistory[idx].count !== newCount) {
      rawHistory[idx] = { ...rawHistory[idx], count: newCount };
      saveNavigationHistory(rawHistory);
      setNavigationHistory(getNavigationHistory());
    }
  };

  // Helper function to get the current active item ID
  // Returns the active thread/space ID, handling note pages by returning their parent thread
  const getCurrentActiveItemId = (): string => {
    // Handle SSR - return empty string if not in browser
    if (typeof window === 'undefined') {
      return '';
    }

    const currentPath = window.location.pathname;
    const currentItemId = extractIdFromPath(currentPath) ?? (currentPath.startsWith('/') ? currentPath.substring(1) : currentPath);

    // If we're on a note page, we need to determine the parent thread
    if (currentItemId.startsWith('note_')) {
      // Priority 0: Check if this note was recently created - use sessionStorage thread ID
      // This handles the race condition where DOM data attributes haven't updated yet
      try {
        const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
        if (recentNotesStr) {
          const recentNotes = JSON.parse(recentNotesStr);
          const fiveSecondsAgo = Date.now() - 5000;
          // Find if current note was recently created
          const recentNote = recentNotes.find((n: any) =>
            n.noteId === currentItemId && n.timestamp > fiveSecondsAgo
          );
          if (recentNote && recentNote.threadId) {
            return recentNote.threadId;
          }
        }
      } catch {
        // Ignore sessionStorage errors, fall through to next priority
      }

      // Priority 1: URL ?thread= parameter (SPA note pages include this in the URL)
      // This works in both SSR and SPA mode and is the most reliable source.
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const threadFromUrl = urlParams.get('thread');
        if (threadFromUrl && threadFromUrl.startsWith('thread_')) {
          return threadFromUrl;
        }
      } catch {
        // Fall through to DOM-based detection
      }

      // Priority 2: localStorage cached parent thread (set when note detail API loads)
      // Works in SPA mode where DOM data attributes don't exist.
      try {
        const cachedThreadId = localStorage.getItem(`harvous-note-thread-${currentItemId}`);
        if (cachedThreadId && cachedThreadId.startsWith('thread_')) {
          return cachedThreadId;
        }
      } catch {
        // Fall through to DOM-based detection
      }

      // Priority 3: try to get from navigation element (set by Layout - more reliable for unorganized notes)
      const navigationElement =
        (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
        (document.querySelector('[slot="navigation"]') as HTMLElement | null);

      if (navigationElement && navigationElement.dataset.parentThreadId) {
        return navigationElement.dataset.parentThreadId;
      }

      // Priority 4: try to get parent thread from note element (fallback)
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;

      if (noteElement && noteElement.dataset.parentThreadId) {
        return noteElement.dataset.parentThreadId;
      }

      // Final fallback: assume unorganized thread
      return 'thread_unorganized';
    }

    return currentItemId;
  };

  // Get raw navigation history from storage (including spaces)
  // Used when finding next item after closing, since getNavigationHistory filters out spaces
  const getRawNavigationHistory = (): any[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = readNavHistoryRaw();
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error getting raw navigation history:', error);
      return [];
    }
  };

  // Remove item from navigation history
  const removeFromNavigationHistory = (itemId: string, options?: RemoveFromNavigationHistoryOptions) => {
    const navigateIfActive = options?.navigateIfActive !== false;
    const history = getNavigationHistory();
    
    // Check if the item being removed is currently active
    const currentActiveItemId = getCurrentActiveItemId();
    // For spaces, also check if it's the selected space (in case pathname doesn't match)
    const selectedSpaceId = getSelectedSpaceId();
    const isActive = itemId === currentActiveItemId || (itemId.startsWith('space_') && itemId === selectedSpaceId);

    // Space-scoped thread close: strip fromSpaceId from openedInSpaceIds instead of deleting the row.
    // If other scopes remain the thread stays visible in those other spaces.
    // Skip for Home-only threads (onboarding, My Pile) — they always do a full close.
    if (itemId.startsWith('thread_') && !isHomeOnlyThread(itemId) && options && Object.prototype.hasOwnProperty.call(options, 'fromSpaceId')) {
      const rawHistoryPartial = getRawNavigationHistory();
      const target = normalizeOpenedInSpaceId(options.fromSpaceId as string | null);

      // Collect the primary item + any same-title duplicates
      const idsToProcess = [itemId];
      if (options.sameTitleAs) {
        for (const row of rawHistoryPartial) {
          if (
            row?.id?.startsWith('thread_') &&
            row.id !== itemId &&
            (row as any).title === options.sameTitleAs
          ) {
            idsToProcess.push(row.id);
          }
        }
      }

      // Try to strip `target` from each row's scopes; track which IDs still have remaining scopes
      let anyPartial = false;
      const fullyRemovedIds: string[] = [];
      const nextRaw = [...rawHistoryPartial];
      for (const procId of idsToProcess) {
        const idx = nextRaw.findIndex((h: any) => h.id === procId);
        if (idx === -1) continue;
        const entry = nextRaw[idx];
        const scopes = getItemOpenedInSpaceIds(entry);
        const remaining = scopes.filter((s) => normalizeOpenedInSpaceId(s) !== target);
        if (remaining.length < scopes.length && remaining.length > 0) {
          nextRaw[idx] = {
            ...entry,
            openedInSpaceIds: remaining,
            openedInSpaceId: normalizeOpenedInSpaceId(
              remaining.find((s) => s != null) ?? remaining[0] ?? null
            ),
            lastAccessed: Date.now(),
          };
          anyPartial = true;
        } else if (remaining.length === 0) {
          fullyRemovedIds.push(procId);
        }
        // remaining.length === scopes.length → target wasn't in this thread's scopes; leave it alone.
      }

      if (anyPartial) {
        // Remove any rows that lost their last scope entirely
        const cleaned = fullyRemovedIds.length > 0
          ? nextRaw.filter((h: any) => !fullyRemovedIds.includes(h.id))
          : nextRaw;
        fullyRemovedIds.forEach((id) => addToClosedItems(id));
        saveNavigationHistory(cleaned);
        setNavigationHistory(getNavigationHistory());
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }, 0);
        }

        if (isActive && navigateIfActive) {
          const currentSpaceKeyFromUrl = ((): string | null => {
            if (typeof window === 'undefined') return null;
            try {
              const fromUrl = new URLSearchParams(window.location.search).get('space');
              if (fromUrl && fromUrl.startsWith('space_')) return fromUrl;
            } catch {
              // ignore
            }
            const path = window.location.pathname;
            if (path.startsWith('/space/')) {
              const spaceId = extractIdFromPath(path);
              if (spaceId?.startsWith('space_')) return spaceId;
            }
            return null;
          })();

          const closedIds = getClosedItems();
          let nextItem: any = null;
          const currentSpaceKey = currentSpaceKeyFromUrl;
          const isValidNeighbor = (navItem: any) => {
            if (!navItem?.id || navItem.id.startsWith('space_')) return false;
            if (closedIds.includes(navItem.id)) return false;
            if (fullyRemovedIds.includes(navItem.id)) return false;
            const neighborScopes = getItemOpenedInSpaceIds(navItem);
            if (currentSpaceKey === null) return neighborScopes.some((s: string | null) => s == null);
            return neighborScopes.includes(currentSpaceKey);
          };

          const currentIndex = cleaned.findIndex((navItem: any) => navItem.id === itemId);
          if (currentIndex !== -1) {
            for (let i = currentIndex + 1; i < cleaned.length && !nextItem; i++) {
              if (cleaned[i].id !== itemId && isValidNeighbor(cleaned[i])) nextItem = cleaned[i];
            }
            for (let i = currentIndex - 1; i >= 0 && !nextItem; i--) {
              if (cleaned[i].id !== itemId && isValidNeighbor(cleaned[i])) nextItem = cleaned[i];
            }
          }

          let targetUrl: string;
          if (nextItem) {
            const spaceParam = currentSpaceKeyFromUrl
              ? `&space=${encodeURIComponent(currentSpaceKeyFromUrl)}`
              : '';
            targetUrl = `${idToUrl(nextItem.id)}?closed=${encodeURIComponent(itemId)}${spaceParam}`;
          } else {
            targetUrl = currentSpaceKeyFromUrl ? idToUrl(currentSpaceKeyFromUrl) : '/';
          }
          if (document.hidden) {
            window.location.href = targetUrl;
            return;
          }
          import('app-navigate')
            .then(({ navigate }) => {
              navigate(targetUrl, { history: 'replace' });
            })
            .catch(async (error) => {
              const errorObj = error instanceof Error ? error : new Error(String(error));
              console.warn('View Transitions import failed, using standard navigation:', errorObj);
              try {
                const { captureException } = await import('@/utils/posthog');
                captureException(errorObj, {
                  context: 'navigation-context',
                  action: 'remove-item-navigate',
                  targetUrl: targetUrl
                });
              } catch {
                // Ignore PostHog import errors
              }
              window.location.href = targetUrl;
            });
        }
        return;
      }
    }

    // If removing an active item, navigate to the next available item first
    if (isActive) {
      // Space context for neighbor selection + fallback — from URL only. getSelectedSpaceId() can
      // stay set to a previously visited space while the user is on a Home thread (no ?space=), which
      // broke neighbor filtering and sent users to the wrong space on close.
      const currentSpaceKeyFromUrl = ((): string | null => {
        if (typeof window === 'undefined') return null;
        try {
          const fromUrl = new URLSearchParams(window.location.search).get('space');
          if (fromUrl && fromUrl.startsWith('space_')) return fromUrl;
        } catch {
          // ignore
        }
        const path = window.location.pathname;
        if (path.startsWith('/space/')) {
          const spaceId = extractIdFromPath(path);
          if (spaceId?.startsWith('space_')) return spaceId;
        }
        return null;
      })();

      // Use raw history (including spaces) to find next item
      const rawHistory = getRawNavigationHistory();
      // When closing a thread with sameTitleAs, remove itemId and all same-title threads so the thread disappears from nav
      const sameTitleIds =
        itemId.startsWith('thread_') && options?.sameTitleAs
          ? rawHistory
              .filter(
                (item: any) =>
                  item?.id?.startsWith('thread_') &&
                  item.title === options.sameTitleAs &&
                  item.id !== itemId
              )
              .map((item: any) => item.id)
          : [];
      const idsToRemove = [itemId, ...sameTitleIds];
      const filteredRawHistory = rawHistory.filter((item: any) => !idsToRemove.includes(item.id));
      const filteredHistory = history.filter((item) => !idsToRemove.includes(item.id));

      const closedIds = getClosedItems();
      const isSpaceOpened = (item: any) =>
        item?.id && item.id.startsWith('space_') && item.id !== itemId && !closedIds.includes(item.id);
      let nextItem = null;
      if (itemId.startsWith('space_')) {
        nextItem = filteredRawHistory.find((item: any) => isSpaceOpened(item)) || null;
      } else {
        // Only navigate to the next thread within the SAME space.
        // Never pick a space entry or a thread from a different space as the next item.
        const currentSpaceKey = currentSpaceKeyFromUrl;
        const isValidNeighbor = (item: any) => {
          // Never navigate to a space entry when closing a thread
          if (!item?.id || item.id.startsWith('space_')) return false;
          // Never pick a thread the user already closed — rawHistory can still contain it if a
          // stale save raced with close; navigating there would reopen via trackNavigationAccess.
          if (closedIds.includes(item.id)) return false;
          // Must be visible in the current space's sidebar
          const scopes = getItemOpenedInSpaceIds(item);
          if (currentSpaceKey === null) return scopes.some((s: string | null) => s == null);
          return scopes.includes(currentSpaceKey);
        };

        // Find position in the ORIGINAL (unfiltered) history, then search for the nearest surviving neighbor
        const currentIndex = rawHistory.findIndex((item: any) => item.id === itemId);
        if (currentIndex !== -1) {
          // Search forward first
          for (let i = currentIndex + 1; i < rawHistory.length && !nextItem; i++) {
            if (!idsToRemove.includes(rawHistory[i].id) && isValidNeighbor(rawHistory[i])) nextItem = rawHistory[i];
          }
          // Then backward
          for (let i = currentIndex - 1; i >= 0 && !nextItem; i--) {
            if (!idsToRemove.includes(rawHistory[i].id) && isValidNeighbor(rawHistory[i])) nextItem = rawHistory[i];
          }
        }
      }

      idsToRemove.forEach((id) => addToClosedItems(id));

      // Save the updated raw history (includes spaces) to storage
      saveNavigationHistory(filteredRawHistory);
      // Use spread operator to create new array reference for React (filtered, no spaces)
      setNavigationHistory([...filteredHistory]);

      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        }, 0);
      }
      
      // Store closed item in sessionStorage to prevent lastVisited update
      // This helps the server-side logic know this navigation is due to closing, not visiting
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          const closedItems = JSON.parse(window.sessionStorage.getItem('harvous-recently-closed-items') || '[]');
          closedItems.push({
            itemId: itemId,
            closedAt: Date.now()
          });
          // Keep only last 10 closed items
          const recent = closedItems.slice(-10);
          window.sessionStorage.setItem('harvous-recently-closed-items', JSON.stringify(recent));
        }
      } catch (error) {
        console.error('Error storing closed item:', error);
      }
      
      // Navigate to next item, current space, or dashboard (unless caller will navigate, e.g. Erase Space → Menu goes to /)
      if (navigateIfActive) {
        let targetUrl: string;
        if (nextItem) {
          const spaceParam =
            itemId.startsWith('thread_') && currentSpaceKeyFromUrl
              ? `&space=${encodeURIComponent(currentSpaceKeyFromUrl)}`
              : '';
          targetUrl = `${idToUrl(nextItem.id)}?closed=${encodeURIComponent(itemId)}${spaceParam}`;
        } else if (itemId.startsWith('space_')) {
          const fallbackSpaceId = getSelectedSpaceId();
          targetUrl =
            fallbackSpaceId && fallbackSpaceId.startsWith('space_') ? idToUrl(fallbackSpaceId) : '/';
        } else {
          targetUrl = currentSpaceKeyFromUrl ? idToUrl(currentSpaceKeyFromUrl) : '/';
        }
        if (document.hidden) {
          window.location.href = targetUrl;
          return;
        }
        import('app-navigate')
          .then(({ navigate }) => {
            navigate(targetUrl, { history: 'replace' });
          })
          .catch(async (error) => {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            console.warn('View Transitions import failed, using standard navigation:', errorObj);
            try {
              const { captureException } = await import('@/utils/posthog');
              captureException(errorObj, {
                context: 'navigation-context',
                action: 'remove-item-navigate',
                targetUrl: targetUrl
              });
            } catch {
              // Ignore PostHog import errors
            }
            window.location.href = targetUrl;
          });
      }
      return; // Exit early since we're navigating or caller will navigate
    }
    
    // Proceed with removal (for non-active items)
    // Use raw history to ensure spaces are also removed from storage
    const rawHistory = getRawNavigationHistory();
    // When closing a thread with sameTitleAs, remove itemId and all same-title threads
    const sameTitleIdsNonActive =
      itemId.startsWith('thread_') && options?.sameTitleAs
        ? rawHistory
            .filter(
              (item: any) =>
                item?.id?.startsWith('thread_') &&
                item.title === options.sameTitleAs &&
                item.id !== itemId
            )
            .map((item: any) => item.id)
        : [];
    const idsToRemoveNonActive = [itemId, ...sameTitleIdsNonActive];
    const filteredRawHistory = rawHistory.filter((item: any) => !idsToRemoveNonActive.includes(item.id));
    const filteredHistory = history.filter((item) => !idsToRemoveNonActive.includes(item.id));

    idsToRemoveNonActive.forEach((id) => addToClosedItems(id));

    // Save the updated raw history (includes spaces) to storage
    saveNavigationHistory(filteredRawHistory);
    // Use spread operator to create new array reference for React (filtered, no spaces)
    setNavigationHistory([...filteredHistory]);

    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      }, 0);
    }
  };

  // Extract item data from page
  const extractItemDataFromPage = (currentItemId: string): Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'> | null => {
    // Handle SSR - return null if not in browser
    if (typeof window === 'undefined') {
      return null;
    }

    // Get data from the stable navigation wrapper (set by NavigationColumnReact.astro).
    // NOTE: The `slot="navigation"` attribute is not reliable at runtime with view transitions.
    const navigationElement =
      (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
      (document.querySelector('[slot="navigation"]') as HTMLElement | null);

    // For notes, try fallback to data-note-id element if navigation element not found
    if (currentItemId.startsWith('note_') && !navigationElement) {
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      if (noteElement && noteElement.dataset.parentThreadId) {
        const pid = noteElement.dataset.parentThreadId;
        return {
          id: pid,
          title: pid === 'thread_unorganized' ? MY_PILE_THREAD_TITLE : (noteElement.dataset.parentThreadTitle || 'Thread'),
          count: parseInt(noteElement.dataset.parentThreadCount || '0'),
          backgroundGradient: noteElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: noteElement.dataset.parentThreadSpaceId || null,
        };
      }
    }

    if (!navigationElement) {
      return null;
    }

    // Page-level metadata is more reliable than the navigation wrapper during View Transitions
    // because the React island can be preserved while the main content swaps.
    const pageMetaElement =
      (document.querySelector(`[data-navigation-item="${currentItemId}"]`) as HTMLElement | null) ??
      (document.querySelector('[data-navigation-item]') as HTMLElement | null);

    // For notes, use parent thread data
    if (currentItemId.startsWith('note_')) {
      const parentThreadId = navigationElement.dataset.parentThreadId;
      if (parentThreadId) {
        return {
          id: parentThreadId,
          title: parentThreadId === 'thread_unorganized' ? MY_PILE_THREAD_TITLE : (navigationElement.dataset.parentThreadTitle || 'Thread'),
          count: parseInt(navigationElement.dataset.parentThreadCount || '0'),
          backgroundGradient: navigationElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: navigationElement.dataset.parentThreadSpaceId || null,
        };
      }
      
      // Fallback: try to get from data-note-id element
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      if (noteElement && noteElement.dataset.parentThreadId) {
        const pid = noteElement.dataset.parentThreadId;
        return {
          id: pid,
          title: pid === 'thread_unorganized' ? MY_PILE_THREAD_TITLE : (noteElement.dataset.parentThreadTitle || 'Thread'),
          count: parseInt(noteElement.dataset.parentThreadCount || '0'),
          backgroundGradient: noteElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: noteElement.dataset.parentThreadSpaceId || null,
        };
      }
    }
    
    // For threads
    if (currentItemId.startsWith('thread_') || navigationElement.dataset.threadId || navigationElement.dataset.threadTitle) {
      // CRITICAL: if we're on a thread route, the URL is the source of truth for the ID.
      // The navigation wrapper dataset can be stale under View Transitions.
      const threadId = currentItemId.startsWith('thread_') ? currentItemId : (navigationElement.dataset.threadId || null);
      if (threadId) {
        const titleFromPage = pageMetaElement?.dataset?.title;
        const countFromPage = pageMetaElement?.dataset?.count;
        const gradientFromPage = pageMetaElement?.dataset?.backgroundGradient;
        return {
          id: threadId,
          title: titleFromPage || navigationElement.dataset.threadTitle || 'Thread',
          count: parseInt(countFromPage || navigationElement.dataset.threadNoteCount || '0'),
          backgroundGradient: gradientFromPage || navigationElement.dataset.threadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: navigationElement.dataset.threadSpaceId || null,
        };
      }
    }
    
    // For spaces
    if (currentItemId.startsWith('space_') || navigationElement.dataset.spaceId || navigationElement.dataset.spaceTitle) {
      // Same issue as threads: prefer the URL ID when on a space route.
      const spaceId = currentItemId.startsWith('space_') ? currentItemId : (navigationElement.dataset.spaceId || null);
      if (spaceId) {
        const titleFromPage = pageMetaElement?.dataset?.title;
        const countFromPage = pageMetaElement?.dataset?.count;
        const gradientFromPage = pageMetaElement?.dataset?.backgroundGradient;
        return {
          id: spaceId,
          title: titleFromPage || navigationElement.dataset.spaceTitle || 'Space',
          count: parseInt(countFromPage || navigationElement.dataset.spaceItemCount || '0'),
          backgroundGradient: gradientFromPage || navigationElement.dataset.spaceBackgroundGradient || 'var(--color-gradient-gray)'
        };
      }
    }
    
    return null;
  };

  const getOpenedInSpaceIdForCurrentLocation = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const fromQuery = normalizeOpenedInSpaceId(new URLSearchParams(window.location.search).get('space'));
      const path = window.location.pathname;
      // On thread/note pages use URL only — never fall back to selected space, so we don't re-scope when user switches space before URL updates.
      if (path.startsWith('/thread/') || path.startsWith('/note/')) {
        return fromQuery;
      }
      return fromQuery ?? getSelectedSpaceId();
    } catch {
      return getSelectedSpaceId();
    }
  };

  // Track navigation access with retry logic
  const trackNavigationAccess = (retryCount = 0) => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    const currentPath = window.location.pathname;
    const currentItemId = extractIdFromPath(currentPath) ?? (currentPath.startsWith('/') ? currentPath.substring(1) : currentPath);

    // Skip dashboard and empty paths
    if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
      return;
    }

    // Skip pages that don't have navigation data (profile, find, etc.)
    const pagesWithoutNavigationData = ['profile', 'search', 'new-space', 'new-thread'];
    if (pagesWithoutNavigationData.includes(currentItemId)) {
      return;
    }

    // Skip specific test items
    const testItemIds = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    if (testItemIds.some(testId => currentItemId.includes(testId))) {
      return;
    }

    // Track spaces too (they should be persistent and closable)
    // Spaces are now tracked in navigation history

    // Extract item data from page
    const itemData = extractItemDataFromPage(currentItemId);
    const openedInSpaceId = getOpenedInSpaceIdForCurrentLocation();

    // Retry logic: if element not found and we haven't retried too many times, retry after a delay
    if (!itemData && retryCount < 3) {
      const retryDelay = 100 * (retryCount + 1); // 100ms, 200ms, 300ms
      setTimeout(() => {
        trackNavigationAccess(retryCount + 1);
      }, retryDelay);
      return;
    }

    if (itemData) {
      // Special handling for spaces - they need to be tracked separately
      // because addToNavigationHistory explicitly skips spaces
      if (itemData.id.startsWith('space_')) {
        // Get current active item ID to check if user explicitly navigated to this space
        const currentActiveItemId = getCurrentActiveItemId();
        const isCurrentlyActive = itemData.id === currentActiveItemId;
        
        // Check if space was closed
        if (isItemClosed(itemData.id)) {
          if (isCurrentlyActive) {
            // User is viewing the space - restore it
            removeFromClosedItems(itemData.id);
          } else {
            // Space is closed and user isn't viewing it - don't add it back
            return;
          }
        }
        
        // Handle space tracking manually (similar to addSpaceToNavigationHistory in NavigationColumn)
        const rawHistory = getRawNavigationHistory();
        const existingIndex = rawHistory.findIndex((item: any) => item.id === itemData.id);
        
        let updatedHistory: any[];
        
        if (existingIndex !== -1) {
          // Update existing space
          updatedHistory = rawHistory.map((item: any, index: number) => {
            if (index === existingIndex) {
              return {
                ...item,
                title: itemData.title,
                backgroundGradient: itemData.backgroundGradient || item.backgroundGradient || 'var(--color-paper)',
                count: itemData.count ?? item.count,
                lastAccessed: Date.now()
              };
            }
            return item;
          });
        } else {
          // Add new space
          const newSpace = {
            id: itemData.id,
            title: itemData.title,
            backgroundGradient: itemData.backgroundGradient || 'var(--color-paper)',
            count: itemData.count ?? 0,
            firstAccessed: Date.now(),
            lastAccessed: Date.now()
          };
          updatedHistory = [...rawHistory, newSpace];
        }
        
        // Sort by firstAccessed to maintain chronological order
        updatedHistory.sort((a: any, b: any) => {
          const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
          const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
          return aFirst - bFirst;
        });
        
        // Limit to 10 items
        const limitedHistory = updatedHistory.length > 10 ? updatedHistory.slice(0, 10) : updatedHistory;
        
        // Save to storage
        saveNavigationHistory(limitedHistory);
        
        // Update React state via getNavigationHistory() so that closed items are properly
        // excluded. The previous filter only stripped space_ IDs, which let user-closed threads
        // re-enter navigationHistory and reappear in the sidebar (e.g. after visiting a space).
        setNavigationHistory(getNavigationHistory());
        
        // Dispatch event to update UI
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }, 0);
        }
        
        // Refresh counts from API after updating
        refreshNavigationCounts();
        return; // Exit early - space handling is complete
      }

      const itemDataWithOpenedIn = {
        ...itemData,
        openedInSpaceIds: [openedInSpaceId],
        openedInSpaceId: openedInSpaceId,
      };

      // Special handling for unorganized thread
      if (currentItemId === 'thread_unorganized' || itemData.id === 'thread_unorganized') {
        // Remove from closed items list if it was there
        removeFromClosedItems('thread_unorganized');
      }

      // Check if this is a new item (not in history yet)
      // Use raw history so we don't drop spaces when saving (getNavigationHistory filters out spaces)
      const rawHistory = getRawNavigationHistory();
      const existingItem = rawHistory.find((h: any) => h.id === itemData.id);

      // Get current active item ID to check if user explicitly navigated to this item
      // For notes: if we extracted thread data, check if we're viewing content in this thread
      // For threads/spaces: check if we're directly viewing this item
      const currentActiveItemId = getCurrentActiveItemId();
      const isCurrentlyActive = itemData.id === currentActiveItemId ||
        (currentItemId.startsWith('note_') && itemData.id && itemData.id.startsWith('thread_'));

      if (!existingItem) {
        // Item doesn't exist in history - check if it was closed
        if (isItemClosed(itemData.id)) {
          // Item was previously closed
          if (isCurrentlyActive) {
            // User is viewing content in this thread - restore it
            removeFromClosedItems(itemData.id);
            addToNavigationHistory(itemDataWithOpenedIn);

            // Refresh counts from API after adding new item to ensure accuracy
            // Use debounced version to prevent multiple rapid refreshes
            refreshNavigationCountsImmediate();
          } else {
            // Item is closed and user isn't viewing it - don't add it back
            return;
          }
        } else {
          // Item is not closed - add it to history (first time opening)
          addToNavigationHistory(itemDataWithOpenedIn);

          // Refresh counts from API after adding new item to ensure accuracy (retry logic handles transient failures)
          refreshNavigationCounts();
        }
      } else {
        // Item exists in history - update it
        // If it was closed but user is now viewing it, remove from closed list
        if (isItemClosed(itemData.id) && isCurrentlyActive) {
          removeFromClosedItems(itemData.id);
        }

        // Update the item data but DON'T change its position (use raw history to preserve spaces).
        // IMPORTANT: Preserve the existing openedInSpaceIds. trackNavigationAccess runs on route
        // changes, but getSelectedSpaceId() may already reflect a NEW space the user just switched to
        // (before the URL has caught up). Overwriting scopes here would re-scope the thread to the
        // wrong space. Only addToNavigationHistory (triggered by the NavigationColumn effect when
        // actually viewing a thread) should set scopes.
        const existingIndex = rawHistory.findIndex((h: any) => h.id === itemData.id);
        const updatedRawHistory = rawHistory.map((item: any, index: number) => {
          if (index === existingIndex) {
            const incomingTitle = itemData.title;
            const keepExistingTitle =
              typeof item.title === 'string' &&
              item.title.trim().length > 0 &&
              (incomingTitle === 'Thread' || !incomingTitle || incomingTitle.trim().length === 0);
            const incomingGradient = itemData.backgroundGradient;
            const keepExistingGradient =
              typeof item.backgroundGradient === 'string' &&
              item.backgroundGradient.trim().length > 0 &&
              (incomingGradient === 'var(--color-gradient-gray)' || !incomingGradient || incomingGradient.trim().length === 0);
            return {
              ...item,
              ...itemData,
              title: keepExistingTitle ? item.title : itemData.title,
              backgroundGradient: keepExistingGradient ? item.backgroundGradient : itemData.backgroundGradient,
              // Preserve existing count — DOM data-attributes can be stale.
              // refreshNavigationCounts (called below) will update with fresh API data.
              count: item.count ?? itemData.count ?? 0,
              // Keep existing scopes — don't overwrite with potentially stale/wrong space
              openedInSpaceIds: getItemOpenedInSpaceIds(item),
              openedInSpaceId: item.openedInSpaceId ?? null,
              lastAccessed: Date.now()
            };
          }
          return item;
        });

        saveNavigationHistory(updatedRawHistory);
        setNavigationHistory(getNavigationHistory());

        // CRITICAL: Dispatch custom event to force UI update during View Transitions
        // React Context updates don't always trigger re-renders during View Transitions
        // Use setTimeout to ensure child components have mounted and set up their event listeners
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }, 0);
        }

        // Refresh counts from API after updating to ensure accuracy (retry logic handles transient failures)
        // This ensures counts match the database even if page data is stale
        refreshNavigationCounts();
      }
    } else if (retryCount >= 3) {
      // DOM data not available (e.g., SPA mode where data attributes don't exist).
      // Still refresh counts from API so navigation badges stay accurate.
      refreshNavigationCounts();
    }
  };

  // Refresh navigation from storage
  const refreshNavigation = () => {
    const history = getNavigationHistory();
    setNavigationHistory(history);
  };

  // Refresh navigation counts (threads and spaces) from API to ensure accuracy
  // Uses verification-based approach instead of debouncing
  const refreshNavigationCounts = useCallback(async () => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    // Check if auth is ready before making API call
    if (!isAuthReady()) {
      // Auth not ready yet, skip silently
      return;
    }

    try {
      
      // Fetch current thread and space counts from API with safe fetch (longer timeout for heavy nav payload)
      // Use cache: 'no-store' to bypass browser cache and get fresh counts after mutations
      const response = await safeFetch('/api/navigation/data', { timeout: 45000, cache: 'no-store', deduplicate: false });

      if (!response || !response.ok) {
        // Silently fail if auth not ready or error occurred
        return;
      }

      const data = await response.json();
      const threads = data.threads || [];
      const spaces = data.spaces || [];
      const memberOfSpaces = data.memberOfSpaces || [];
      // Use raw history so we preserve spaces when saving (getNavigationHistory filters out spaces)
      const rawHistory = getRawNavigationHistory();
      
      // Get unorganized thread from API response
      const unorganizedThreadFromAPI = threads.find((t: any) => t.id === 'thread_unorganized');
      const unorganizedCountFromAPI = unorganizedThreadFromAPI?.noteCount || 0;
      
      const updatedHistory = rawHistory.map((item: any) => {
        // Check if this is a thread
        if (item.id.startsWith('thread_')) {
          // Find matching thread in API response
          const threadData = threads.find((t: any) => t.id === item.id);
          
          if (threadData) {
            const newCount = threadData.noteCount || 0;
            const currentCount = item.count || 0;
            
            // Always update to API count — we use cache: 'no-store' to ensure fresh data
            if (currentCount !== newCount) {
              return { ...item, count: newCount, spaceId: threadData.spaceId ?? item.spaceId ?? null };
            }
            // Counts match — still fill spaceId if missing.
            if (item.spaceId == null && threadData.spaceId != null) {
              return { ...item, spaceId: threadData.spaceId };
            }
            return item;
          } else if (item.id === 'thread_unorganized') {
            // Unorganized thread should always be in API response now
            // But handle gracefully if it's missing
            const unorganizedThread = threads.find((t: any) => t.id === 'thread_unorganized');
            if (unorganizedThread) {
              const newCount = unorganizedThread.noteCount || 0;
              const currentCount = item.count || 0;

              // If unorganized has 0 notes, mark as closed but keep in history to preserve position.
              // When notes are later added, it will be reopened at the same position.
              if (newCount === 0) {
                addToClosedItems('thread_unorganized');
                return { ...item, count: 0, spaceId: null };
              }

              // Do NOT call removeFromClosedItems here: if the user explicitly closed My Pile
              // while it still had notes, we must respect that choice. Re-opening is handled
              // by handleNoteCreated (new note → addToNavigationHistory) and
              // handleNoteRemovedFromThread (note moved to unorganized). A background count
              // refresh should only auto-close (count=0), never auto-open.

              // Always update to API count — fresh data via cache: 'no-store'
              if (currentCount !== newCount) {
                return { ...item, count: newCount, spaceId: null };
              }
            } else {
              // Unorganized not in API response - if current count is 0, mark as closed
              if ((item.count || 0) === 0) {
                addToClosedItems('thread_unorganized');
                return { ...item, count: 0 };
              }
            }
            return item; // Keep current count if API doesn't have it or count is stale
          } else {
            // Thread not found in API - might be deleted
            // But if this is unorganized and it's not in history yet, check if we should add it
            // Only add if it actually has notes (count > 0)
            if (item.id === 'thread_unorganized' && unorganizedCountFromAPI > 0) {
              // Unorganized has notes but wasn't in history - add it
              const newCount = unorganizedCountFromAPI;
              return { ...item, count: newCount };
            }
            return item; // Keep as is
          }
        } 
        // Check if this is a space
        else if (item.id.startsWith('space_')) {
          // Find matching space in API response (check owned spaces and member-of spaces)
          const spaceData = spaces.find((s: any) => s.id === item.id)
            || memberOfSpaces.find((s: any) => s.id === item.id);
          
          if (spaceData) {
            const newCount = spaceData.totalItemCount || 0;
            const currentCount = item.count || 0;
            // Always update to API count — fresh data via cache: 'no-store'
            if (currentCount !== newCount) {
              return { ...item, count: newCount };
            }
            return item;
          } else {
            // Space not found in API - might be deleted
            return item; // Keep as is
          }
        }
        // Unknown item type - keep as is
        return item;
      });

      // Fetch counts for threads not in the API response (shared space threads).
      // These threads are owned by another user, so getAllThreadsWithCounts doesn't include them.
      const sharedThreadIds = updatedHistory
        .filter(item => item !== null && item.id.startsWith('thread_') && item.id !== 'thread_unorganized' && !threads.find((t: any) => t.id === item.id))
        .map(item => item!.id);

      /** Ids removed by shared-thread prefetch (404). Excluded from merge so we don't resurrect them. */
      const prefetchRemovedIds = new Set<string>();

      if (sharedThreadIds.length > 0) {
        await Promise.all(sharedThreadIds.map(async (threadId) => {
          try {
            const resp = await safeFetch(`/api/threads/${threadId}/prefetch`, { timeout: 15000 });
            const idx = updatedHistory.findIndex(item => item?.id === threadId);
            if (idx === -1) return;
            // Gone or no access — drop stale nav pills (e.g. erased thread, left shared space).
            if (resp?.status === 404) {
              const victim = updatedHistory[idx];
              if (victim?.id) prefetchRemovedIds.add(victim.id);
              updatedHistory[idx] = null;
              return;
            }
            if (resp && resp.ok) {
              const data = await resp.json();
              if (data.thread?.noteCount != null) {
                updatedHistory[idx] = { ...updatedHistory[idx]!, count: data.thread.noteCount };
              }
            }
          } catch { /* skip — offline / transient */ }
        }));
      }

      // Read rawHistory AFTER all async work so we never save a stale snapshot that re-adds threads
      // the user closed during the prefetch gap (same idea as backfillThreadSpaceIds).
      const patchById = new Map<string, NavigationItem>();
      for (const entry of updatedHistory) {
        if (entry === null) continue;
        patchById.set(entry.id, entry);
      }
      const freshRawHistory = getRawNavigationHistory();
      const mergedHistory = freshRawHistory
        .filter((item: any) => !prefetchRemovedIds.has(item.id))
        .map((item: any) => {
          const p = patchById.get(item.id);
          if (!p) return item;
          if (typeof item.id === 'string' && item.id.startsWith('space_')) {
            return { ...item, count: p.count ?? item.count };
          }
          return {
            ...item,
            count: p.count ?? item.count,
            spaceId: p.spaceId !== undefined ? p.spaceId : item.spaceId,
          };
        });

      // Check if any counts actually changed or items were removed
      const hasChanges =
        mergedHistory.length !== freshRawHistory.length ||
        mergedHistory.some((item: any) => {
          const orig = freshRawHistory.find((x: any) => x.id === item.id);
          if (!orig) return true;
          if (orig.count !== item.count) return true;
          if (typeof item.id === 'string' && item.id.startsWith('thread_')) {
            return (orig.spaceId ?? null) !== (item.spaceId ?? null);
          }
          return false;
        });

      // Save and update state if there were changes (mergedHistory includes spaces)
      if (hasChanges) {
        saveNavigationHistory(mergedHistory);
        setNavigationHistory(getNavigationHistory());
      }
    } catch (error) {
      console.error('NavigationContext: Error refreshing navigation counts:', error);
    }
  }, [setNavigationHistory]); // Only include setNavigationHistory (from useState, already stable)

  // Immediate refresh with verification (no debounce delay)
  // Uses sessionStorage to detect if immediate refresh is needed
  const refreshNavigationCountsImmediate = async () => {
    await refreshNavigationCounts();
  };

  // Ref to track timeout for debounced refresh
  const refreshNavigationCountsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced version of refreshNavigationCounts
  const debouncedRefreshNavigationCounts = useCallback(() => {
    // Clear any existing timeout
    if (refreshNavigationCountsTimeoutRef.current) {
      clearTimeout(refreshNavigationCountsTimeoutRef.current);
    }
    
    // Set new timeout
    refreshNavigationCountsTimeoutRef.current = setTimeout(() => {
      refreshNavigationCounts();
      refreshNavigationCountsTimeoutRef.current = null;
    }, 500); // 500ms debounce
  }, [refreshNavigationCounts]);

  // Validation cache to prevent redundant API calls (threads + spaces for stale-item cleanup)
  const validationCache = useRef<{ timestamp: number; threadIds: Set<string>; spaceIds: Set<string> } | null>(null);
  const VALIDATION_CACHE_DURATION = 60 * 1000; // 1 minute cache
  const VALIDATION_DEBOUNCE_DELAY = 2000; // 2 seconds debounce
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track recently created notes to avoid double-counting
  // When a note is created with a suggested thread, it's immediately added to that thread
  // We shouldn't decrement unorganized if the note was never actually in unorganized
  const recentlyCreatedNotes = useRef<Set<string>>(new Set());

  // Function to validate navigation history and remove deleted threads and spaces
  const validateNavigationHistory = async (force = false) => {
    try {
      // Check cache first - skip if recent validation exists and not forced
      const now = Date.now();
      if (!force && validationCache.current && (now - validationCache.current.timestamp) < VALIDATION_CACHE_DURATION) {
        const threadIds = validationCache.current.threadIds;
        const spaceIds = validationCache.current.spaceIds ?? new Set<string>();
        const rawHistory = getRawNavigationHistory();
        const thirtySecondsAgo = Date.now() - 30000;

        const validatedHistory = rawHistory.filter((item: any) => {
          if (item.firstAccessed > thirtySecondsAgo) return true;
          if (item.id.startsWith('space_')) return spaceIds.size === 0 || spaceIds.has(item.id);
          if (item.id === 'thread_unorganized') return true;
          if (item.id.startsWith('thread_')) return threadIds.has(item.id);
          return true;
        });

        if (validatedHistory.length < rawHistory.length) {
          saveNavigationHistory(validatedHistory);
          setNavigationHistory(getNavigationHistory());
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        }
        return;
      }

      // Check if auth is ready before making API call
      if (!isAuthReady()) {
        // Auth not ready yet, skip validation silently
        return;
      }

      // Skip validation when offline - no need to hit network
      if (!navigator.onLine) {
        return;
      }

      // Fetch current threads and spaces in one call (used for dropdown + nav; validates both)
      const response = await safeFetch('/api/navigation/data', { timeout: 45000 });
      
      if (!response || !response.ok) {
        return;
      }
      
      const data = await response.json();
      const threads = data.threads ?? [];
      const spaces = data.spaces ?? [];
      const threadIds = new Set<string>(threads.map((t: any) => t.id as string));
      const spaceIds = new Set<string>(spaces.map((s: any) => s.id as string));
      
      validationCache.current = {
        timestamp: now,
        threadIds,
        spaceIds
      };
      
      const rawHistory = getRawNavigationHistory();
      const thirtySecondsAgo = Date.now() - 30000;

      const validatedHistory = rawHistory.filter((item: any) => {
        if (item.firstAccessed > thirtySecondsAgo) return true;
        if (item.id.startsWith('space_')) return spaceIds.has(item.id);
        if (item.id === 'thread_unorganized') return true;
        if (item.id.startsWith('thread_')) return threadIds.has(item.id);
        return true;
      });
      
      if (validatedHistory.length < rawHistory.length) {
        saveNavigationHistory(validatedHistory);
        setNavigationHistory(getNavigationHistory());
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      }
    } catch (error) {
      // Silently fail - validation is not critical
      console.error('Error validating navigation history:', error);
    }
  };

  // Debounced validation function
  const debouncedValidate = (force = false) => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    validationTimeoutRef.current = setTimeout(() => {
      validateNavigationHistory(force);
    }, VALIDATION_DEBOUNCE_DELAY);
  };

  // Initialize navigation history on mount and refresh it
  // This ensures we have the latest data even if localStorage was updated right before navigation
  useEffect(() => {
      // Refresh from localStorage to ensure we have the latest data
      // (especially important after navigation when localStorage might have been updated)
      const refreshHistory = () => {
        const history = getNavigationHistory();
        setNavigationHistory(history);
      };
    
    // Refresh immediately - single refresh is sufficient
    refreshHistory();

    // On mount, scrub stale raw nav history: if any items that are in the closed-items list
    // survived in localStorage (e.g. a previous save bounced to sessionStorage and the stale
    // localStorage copy was never overwritten), strip them now and write back. This guarantees
    // that no matter what happened in a prior session, a refresh can't resurrect closed items.
    try {
      const closedOnLoad = getClosedItems();
      if (closedOnLoad.length > 0) {
        const rawOnLoad = getRawNavigationHistory();
        const closedSet = new Set(closedOnLoad);
        const scrubbed = rawOnLoad.filter(
          (item: any) => !item?.id || item.id === 'thread_unorganized' || !closedSet.has(item.id)
        );
        if (scrubbed.length < rawOnLoad.length) {
          writeNavHistory(JSON.stringify(scrubbed));
        }
      }
    } catch { /* non-critical */ }

    // One-time migration: clear likely-seeded thread list (old code used to seed nav from API when empty).
    // If history has many threads and we haven't migrated yet, keep only the current page's thread (or none).
    const MIGRATION_KEY = 'harvous-nav-migrated-no-seed-v1';
    const MAX_THREADS_BEFORE_CONSIDER_SEEDED = 3;
    try {
      if (typeof window !== 'undefined' && !safeGetItem(MIGRATION_KEY)) {
        const rawHistory = getRawNavigationHistory();
        const threadItems = rawHistory.filter((item: any) => item?.id?.startsWith('thread_'));
        if (threadItems.length > MAX_THREADS_BEFORE_CONSIDER_SEEDED) {
          const pathname = window.location.pathname || '';
          const threadMatch = pathname.match(/^\/thread\/(.+)$/);
          const keepThreadId = threadMatch ? 'thread_' + threadMatch[1] : null;
          const nonThreads = rawHistory.filter((item: any) => !item?.id?.startsWith('thread_'));
          const threadsToKeep = keepThreadId
            ? threadItems.filter((item: any) => item.id === keepThreadId)
            : [];
          const migrated = [...nonThreads, ...threadsToKeep];
          saveNavigationHistory(migrated);
          setNavigationHistory(getNavigationHistory());
          safeSetItem(MIGRATION_KEY, '1', { cleanupOldest: false, fallbackToSession: false });
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        } else {
          safeSetItem(MIGRATION_KEY, '1', { cleanupOldest: false, fallbackToSession: false });
        }
      }
    } catch {
      // non-critical
    }

    // One-time repair: strip bad space scopes from Home-only threads (onboarding, My Pile).
    // Earlier scope-merging code incorrectly accumulated space IDs on these threads.
    const REPAIR_HOME_ONLY_KEY = 'harvous-nav-repair-home-only-v1';
    try {
      if (typeof window !== 'undefined' && !safeGetItem(REPAIR_HOME_ONLY_KEY)) {
        const rawHistory = getRawNavigationHistory();
        let repaired = false;
        const repairedHistory = rawHistory.map((item: any) => {
          if (!item?.id || !isHomeOnlyThread(item.id)) return item;
          const scopes = Array.isArray(item.openedInSpaceIds) ? item.openedInSpaceIds : [];
          const hasSpaceScopes = scopes.some((s: unknown) => typeof s === 'string' && s.startsWith('space_'));
          if (hasSpaceScopes || (scopes.length > 0 && !scopes.includes(null))) {
            repaired = true;
            return { ...item, openedInSpaceIds: [null], openedInSpaceId: null };
          }
          return item;
        });
        if (repaired) {
          saveNavigationHistory(repairedHistory);
          setNavigationHistory(getNavigationHistory());
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        }
        safeSetItem(REPAIR_HOME_ONLY_KEY, '1', { cleanupOldest: false, fallbackToSession: false });
      }
    } catch {
      // non-critical
    }

    // Track current page access
    trackNavigationAccess();

    // We do not seed navigation from API when history is empty. Threads/spaces only appear
    // in the nav when the user has opened them (trackNavigationAccess adds the current page).

    // Backfill thread spaceIds for existing navigation history entries (once per session as needed).
    const backfillThreadSpaceIds = async () => {
      try {
        if (typeof window === 'undefined') return;
        // Quick pre-flight: check if any threads need backfilling before hitting the network.
        const preflightHistory = getRawNavigationHistory();
        const needsBackfill = preflightHistory.some((item: any) => {
          return item?.id?.startsWith('thread_') && item.id !== 'thread_unorganized' && item.spaceId === undefined;
        });
        if (!needsBackfill) return;

        if (!isAuthReady() || !navigator.onLine) return;
        const response = await safeFetch('/api/navigation/data', { timeout: 45000 });
        if (!response || !response.ok) return;
        const data = await response.json();
        const threadsFromApi = data.threads || [];
        const spaceIdByThreadId = new Map<string, string | null>();
        for (const t of threadsFromApi) {
          if (t?.id) spaceIdByThreadId.set(t.id, t.spaceId ?? null);
        }

        // Read rawHistory AFTER the async call so we work with the CURRENT state of localStorage.
        // Reading before the await caused a race: threads closed during the network round-trip
        // were restored to raw history when the stale pre-call snapshot was saved back.
        const rawHistory = getRawNavigationHistory();
        const updatedHistory = rawHistory.map((item: any) => {
          if (!item?.id?.startsWith('thread_') || item.id === 'thread_unorganized') return item;
          if (item.spaceId !== undefined) return item;
          return { ...item, spaceId: spaceIdByThreadId.get(item.id) ?? null };
        });

        saveNavigationHistory(updatedHistory);
        setNavigationHistory(getNavigationHistory());
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      } catch {
        // non-critical
      }
    };

    backfillThreadSpaceIds();
    
    // Run forced validation once after auth is likely ready (e.g. fresh sign-in on another browser).
    // This clears stale spaces/threads from localStorage so dropdown and nav don't show deleted items.
    const runInitialValidation = () => {
      const delay = 1500;
      setTimeout(() => {
        if (isAuthReady() && navigator.onLine) {
          validateNavigationHistory(true);
        } else {
          debouncedValidate();
        }
      }, delay);
    };

    // Delay validation to avoid blocking initial render
    const scheduleValidation = () => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          runInitialValidation();
        }, { timeout: 3000 });
      } else {
        setTimeout(runInitialValidation, 2000);
      }
    };
    
    scheduleValidation();
    
    // Listen for View Transitions and page loads
    // Use requestAnimationFrame to ensure updates happen after DOM is ready
    const handlePageLoad = () => {
      // Use requestAnimationFrame for immediate visual updates
      requestAnimationFrame(() => {
        // Refresh navigation history from localStorage on page load
        // This ensures we have the latest data after navigation
        refreshHistory();
        trackNavigationAccess();
        
        // Check if we're on a note page and refresh navigation counts
        // This ensures badge counts are accurate when navigating to note pages
        // This is especially important after creating a note with a suggested thread and redirecting
        const currentPath = window.location.pathname;
        const isNotePage = currentPath.startsWith('/note/');
        const threadIdFromPath = extractIdFromPath(currentPath);
        if (threadIdFromPath?.startsWith('thread_')) {
          clearNavStack(threadIdFromPath);
        }
        
        if (isNotePage) {
          // Refresh navigation counts after a delay to ensure counts are accurate after redirect
          // Use debounced version to prevent multiple rapid refreshes from overwriting each other
          debouncedRefreshNavigationCounts();
        }
        
        // Only validate if cache is stale - don't validate on every page load
        // Validation will happen automatically via debouncedValidate if needed
      });
    };
    
    // Listen for space creation events
    const handleSpaceCreated = (event: CustomEvent) => {
      const space = event.detail?.space;
      if (space) {
        // Skip specific test spaces (exact title matches only)
        const testSpaceTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
        if (testSpaceTitles.includes(space.title)) {
          return;
        }
        // Reload navigation history from localStorage (which was updated synchronously)
        const history = getNavigationHistory();
        setNavigationHistory(history);
      }
    };
    
    // Listen for thread creation events
    const handleThreadCreated = (event: CustomEvent) => {
      const thread = event.detail?.thread;
      if (thread) {
        // Skip specific test threads (exact title matches only)
        const testThreadTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
        if (testThreadTitles.includes(thread.title)) {
          return;
        }
        // Reload navigation history from localStorage (which was updated synchronously)
        const history = getNavigationHistory();
        setNavigationHistory(history);
      }
    };

    // Listen for thread deletion events
    const handleThreadDeleted = (event: CustomEvent) => {
      const threadId = event.detail?.threadId;
      if (threadId) {
        // Caller (e.g. performThreadErase) navigates; do not navigate from here to avoid races.
        removeFromNavigationHistory(threadId, { navigateIfActive: false });
        validationCache.current = null;
        validateNavigationHistory(true);
      }
    };

    // Listen for note creation events to update thread counts
    const handleNoteCreated = async (event: CustomEvent) => {
      // PHASE 2: Use event detail as primary source (includes threadId and noteId)
      const note = event.detail?.note;
      // Use threadId from event detail first, then actualThreadId, then note.threadId
      const actualThreadId = event.detail?.threadId || event.detail?.actualThreadId || note?.threadId;
      if (note && actualThreadId) {
        // Track this note as recently created to avoid double-counting in noteAddedToThread
        // Remove it after 2 seconds (enough time for noteAddedToThread to fire)
        if (note.id) {
          recentlyCreatedNotes.current.add(note.id);
          setTimeout(() => {
            recentlyCreatedNotes.current.delete(note.id);
          }, 2000);
        }
        
        // If actualThreadId is provided and it's not unorganized, don't add unorganized to navigation
        // This prevents unorganized from appearing when a note is created with a suggested thread
        // The note was never actually in unorganized (it was immediately added to the thread via junction table)
        const wasCreatedWithThread = event.detail?.actualThreadId && event.detail.actualThreadId !== 'thread_unorganized';
        
        // CRITICAL: Update localStorage SYNCHRONOUSLY before React state update
        // Use raw history so we preserve spaces when saving
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === actualThreadId);
        
        if (threadIndex !== -1) {
          // Thread exists in history - update the count immediately
          const existingItem = rawHistory[threadIndex];
          const oldCount = existingItem.count || 0;
          const newCount = oldCount + 1;
          
          // Update localStorage SYNCHRONOUSLY (before React state update)
          const updatedRawHistory = rawHistory.map((item: any, index: number) =>
            index === threadIndex
              ? { ...item, count: newCount }
              : item
          );
          saveNavigationHistory(updatedRawHistory);
          setNavigationHistory(getNavigationHistory());
          
          // Dispatch event for UI update
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }
          
          // Check if entry has incomplete data and fetch full data in background
          const needsFullData = existingItem.title === existingItem.id || !existingItem.backgroundGradient || existingItem.backgroundGradient === 'var(--color-paper)';
          if (needsFullData) {
            safeFetch('/api/threads/list')
              .then(response => {
                if (response && response.ok) {
                  return response.json();
                }
                return null;
              })
              .then(threads => {
                if (threads) {
                  const threadData = threads.find((t: any) => t.id === actualThreadId);
                  if (threadData) {
                    const rawHistory = getRawNavigationHistory();
                    const fullDataHistory = rawHistory.map((item: any) =>
                      item.id === actualThreadId
                        ? {
                            ...item,
                            title: threadData.title,
                            backgroundGradient: threadData.backgroundGradient || item.backgroundGradient
                          }
                        : item
                    );
                    saveNavigationHistory(fullDataHistory);
                    setNavigationHistory(getNavigationHistory());
                  }
                }
              })
              .catch(error => {
                console.error('NavigationContext: Error fetching thread data for update:', error);
              });
          }
        } else {
          // Thread not in history - we need to fetch it and add it (unless caller will navigate to note)
          // CRITICAL: When note is created in unorganized, add unorganized synchronously even if we're about to navigate.
          // This ensures the desktop nav shows My Pile before/after navigation (trackNavigationAccess can run before new DOM is ready).
          if (actualThreadId === 'thread_unorganized' && !wasCreatedWithThread) {
            addToNavigationHistory({
              id: 'thread_unorganized',
              title: MY_PILE_THREAD_TITLE,
              count: 1, // At least 1 (the new note)
              backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
            });
          } else if (event.detail?.willNavigateToNote) {
            // Do nothing - trackNavigationAccess will handle it on the new page
          } else if (isAuthReady()) {
            safeFetch('/api/threads/list')
            .then(response => {
              if (response && response.ok) {
                return response.json();
              }
              // Silently fail if auth not ready or error occurred
              return null;
            })
            .then(threads => {
              if (!threads) {
                // Auth not ready or error occurred, skip silently
                return;
              }
              
              const threadData = threads.find((t: any) => t.id === actualThreadId);
              
              if (threadData) {
                // Add thread to navigation history using addToNavigationHistory
                // This will update both localStorage and React state
                addToNavigationHistory({
                  id: threadData.id,
                  title: threadData.title,
                  count: threadData.noteCount || 1, // Use fetched count or at least 1 (the new note)
                  backgroundGradient: threadData.backgroundGradient || 'var(--color-gradient-gray)'
                });
              } else if (actualThreadId === 'thread_unorganized' && !wasCreatedWithThread) {
                // Special handling for unorganized thread (only if note actually has no junction entries)
                // Don't add unorganized if the note was created with a specific thread (wasCreatedWithThread)
                // This prevents unorganized from appearing when a note is created with a suggested thread
                // IMPORTANT: If wasCreatedWithThread is true, unorganized should NEVER be added
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: MY_PILE_THREAD_TITLE,
                  count: 1, // At least 1 (the new note)
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
              // If wasCreatedWithThread is true and actualThreadId is not 'thread_unorganized',
              // we've already added the thread above, so unorganized should NOT be added here
            })
            .catch(error => {
              console.error('NavigationContext: Error fetching thread data:', error);
              // Fallback: add unorganized thread with minimal data if fetch fails
              // Only if the note actually belongs to unorganized (no junction entries)
              // Don't add unorganized if the note was created with a specific thread
              // IMPORTANT: If wasCreatedWithThread is true, unorganized should NEVER be added, even on error
              if (actualThreadId === 'thread_unorganized' && !wasCreatedWithThread) {
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: MY_PILE_THREAD_TITLE,
                  count: 1,
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
              // If wasCreatedWithThread is true, we should NOT add unorganized even if the fetch fails
              // The note was created with a specific thread, so unorganized should never appear
            });
          }
        }
        
        // Refresh counts from API after a delay to ensure database is committed
        // Use debounced version to prevent multiple rapid refreshes from overwriting each other
        debouncedRefreshNavigationCounts();
      }
    };

    // Listen for note removal from thread events
    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId) {
        // Use raw history so we preserve spaces when saving
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === threadId);
        const unorganizedIndex = rawHistory.findIndex((item: any) => item.id === 'thread_unorganized');
        
        const updatedRawHistory = rawHistory.map((item: any, index: number) => {
          if (index === threadIndex) {
            const oldCount = item.count || 0;
            return { ...item, count: Math.max(0, oldCount - 1) };
          }
          if (index === unorganizedIndex) {
            const oldUnorganizedCount = item.count || 0;
            return { ...item, count: oldUnorganizedCount + 1 };
          }
          return item;
        });
        
        saveNavigationHistory(updatedRawHistory);
        setNavigationHistory(getNavigationHistory());
        
        // Refresh counts from API after a delay to ensure database is committed
        setTimeout(async () => {
          await refreshNavigationCounts();
          // Check if unorganized should be reopened if it was closed
          // Check auth before making API call
          if (isAuthReady()) {
            const history = getNavigationHistory();
            const unorganizedInHistory = history.find(i => i.id === 'thread_unorganized');
            if (!unorganizedInHistory && isItemClosed('thread_unorganized')) {
              // It's closed, let's get the count and see if we should reopen
              // But only if it actually has notes (count > 0)
              const response = await safeFetch('/api/navigation/data', { timeout: 45000 });
              if (response && response.ok) {
                const data = await response.json();
                const threads = data.threads || [];
                const unorganizedThread = threads.find((t: any) => t.id === 'thread_unorganized');
                // Only reopen if unorganized has notes (count > 0)
                // This prevents it from appearing when notes are created with suggested threads
                if (unorganizedThread && unorganizedThread.noteCount > 0) {
                  // Reopen it — remove from closed items so it's visible again at its original position
                  removeFromClosedItems('thread_unorganized');
                  // Update count in history (it's still in rawHistory, just was closed)
                  const rawHist = getRawNavigationHistory();
                  const unorgIdx = rawHist.findIndex((i: any) => i.id === 'thread_unorganized');
                  if (unorgIdx !== -1) {
                    rawHist[unorgIdx] = { ...rawHist[unorgIdx], count: unorganizedThread.noteCount };
                    saveNavigationHistory(rawHist);
                    setNavigationHistory(getNavigationHistory());
                  } else {
                    // Wasn't in raw history at all — add it
                    addToNavigationHistory({
                      id: 'thread_unorganized',
                      title: MY_PILE_THREAD_TITLE,
                      count: unorganizedThread.noteCount,
                      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                    });
                  }
                }
              }
            }
          }
        }, 300);
      }
    };

    // Listen for note addition to thread events
    const handleThreadUpdated = (event: CustomEvent) => {
      const { threadId, title, backgroundGradient } = event.detail || {};
      if (!threadId) return;

      const applyHistoryUpdate = (nextTitle: string, nextGradient: string) => {
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === threadId);
        if (threadIndex === -1) return;
        const updatedRawHistory = rawHistory.map((item: any, index: number) =>
          index === threadIndex
            ? {
                ...item,
                title: nextTitle,
                backgroundGradient: nextGradient || item.backgroundGradient,
              }
            : item,
        );
        saveNavigationHistory(updatedRawHistory);
        setNavigationHistory(getNavigationHistory());
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      };

      // Same pattern as spaceUpdated: use event detail when complete (avoids /api/threads/list on every rename)
      if (title && backgroundGradient) {
        applyHistoryUpdate(title, backgroundGradient);
        return;
      }

      if (!isAuthReady()) {
        return;
      }

      safeFetch('/api/threads/list')
        .then(response => {
          if (response && response.ok) {
            return response.json();
          }
          return null;
        })
        .then(threads => {
          if (threads) {
            const threadData = threads.find((t: any) => t.id === threadId);
            if (threadData) {
              applyHistoryUpdate(
                threadData.title,
                threadData.backgroundGradient || '',
              );
            }
          }
        })
        .catch(error => {
          console.error('NavigationContext: Error fetching thread data for update:', error);
        });
    };
    
    // Listen for space update events
    const handleSpaceUpdated = (event: CustomEvent) => {
      const { spaceId, title, backgroundGradient } = event.detail || {};
      if (!spaceId) return;
      
      // Use event detail if available (immediate update), otherwise fetch from API
      if (title && backgroundGradient) {
        const rawHistory = getRawNavigationHistory();
        const spaceIndex = rawHistory.findIndex((item: any) => item.id === spaceId);
        if (spaceIndex !== -1) {
          const updatedRawHistory = rawHistory.map((item: any, index: number) =>
            index === spaceIndex
              ? { ...item, title, backgroundGradient }
              : item
          );
          saveNavigationHistory(updatedRawHistory);
          setNavigationHistory(getNavigationHistory());
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        }
      } else {
        // Fallback: fetch from API if event detail is incomplete
        if (!isAuthReady()) {
          return; // Auth not ready yet
        }
        
        safeFetch('/api/navigation/data', { timeout: 45000 })
          .then(response => {
            if (response && response.ok) {
              return response.json();
            }
            return null;
          })
          .then(data => {
            if (data && data.spaces) {
              const spaceData = data.spaces.find((s: any) => s.id === spaceId);
              if (spaceData) {
                const rawHistory = getRawNavigationHistory();
                const spaceIndex = rawHistory.findIndex((item: any) => item.id === spaceId);
                if (spaceIndex !== -1) {
                  const updatedRawHistory = rawHistory.map((item: any, index: number) =>
                    index === spaceIndex
                      ? {
                          ...item,
                          title: spaceData.title,
                          backgroundGradient: spaceData.backgroundGradient || item.backgroundGradient
                        }
                      : item
                  );
                  saveNavigationHistory(updatedRawHistory);
                  setNavigationHistory(getNavigationHistory());
                  window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
                }
              }
            }
          })
          .catch(error => {
            console.error('NavigationContext: Error fetching space data for update:', error);
          });
      }
    };
    
    const handleNoteAddedToThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId && threadId !== 'thread_unorganized') {
        // Check if this note was just created (within last 2 seconds)
        // If so, it was never actually in unorganized, so don't add unorganized to navigation
        const wasJustCreated = recentlyCreatedNotes.current.has(noteId);
        
        // Notes always start in unorganized, so when moved to a thread, decrement unorganized
        // Use raw history so we preserve spaces when saving
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === threadId);
        const unorganizedIndex = rawHistory.findIndex((item: any) => item.id === 'thread_unorganized');
        
        let updatedRawHistory: any[];
        let shouldRemoveUnorganized = false;
        
        if (wasJustCreated && unorganizedIndex === -1 && threadIndex !== -1) {
          updatedRawHistory = rawHistory.map((item: any, index: number) => {
            if (index === threadIndex) {
              const oldCount = item.count || 0;
              return { ...item, count: oldCount + 1 };
            }
            return item;
          });
        } else {
          updatedRawHistory = rawHistory.map((item: any, index: number) => {
            if (index === threadIndex) {
              const oldCount = item.count || 0;
              return { ...item, count: oldCount + 1 };
            }
            if (index === unorganizedIndex) {
              const oldUnorganizedCount = item.count || 0;
              const newUnorganizedCount = Math.max(0, oldUnorganizedCount - 1);
              if (newUnorganizedCount === 0) {
                shouldRemoveUnorganized = true;
                return null;
              }
              return { ...item, count: newUnorganizedCount };
            }
            return item;
          }).filter((item: any) => item !== null);
        }
        
        saveNavigationHistory(updatedRawHistory);
        setNavigationHistory(getNavigationHistory());
        if (shouldRemoveUnorganized) {
          addToClosedItems('thread_unorganized');
        }
        
        // Remove from recently created set after processing
        recentlyCreatedNotes.current.delete(noteId);
        
        // Refresh navigation counts immediately with verification (no debounce delay)
        refreshNavigationCountsImmediate();
      }
    };

    // Listen for space deletion events
    const handleSpaceDeleted = (event: CustomEvent) => {
      const spaceId = event.detail?.spaceId;
      if (spaceId) {
        // Remove the space from navigation history only; Menu already navigates to /
        removeFromNavigationHistory(spaceId, { navigateIfActive: false });
        // Clear selected space so desktop nav shows "My Home" after redirect
        if (getSelectedSpaceId() === spaceId) {
          setSelectedSpaceId(null);
        }
      }
    };

    // Listen for note deletion events
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      const actualThreadId = threadId || event.detail?.note?.threadId;
      
      if (noteId && actualThreadId) {
        // Track deletion in sessionStorage for refresh detection
        trackNoteDeletion(noteId, actualThreadId);
        
        let shouldCloseUnorganized = false;
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === actualThreadId);
        if (threadIndex !== -1) {
          const oldCount = rawHistory[threadIndex].count || 0;
          const newCount = Math.max(0, oldCount - 1);
          if (actualThreadId === 'thread_unorganized' && newCount === 0) {
            shouldCloseUnorganized = true;
          }
          const updatedRawHistory = rawHistory.map((item: any, index: number) =>
            index === threadIndex ? { ...item, count: newCount } : item
          );
          saveNavigationHistory(updatedRawHistory);
          setNavigationHistory(getNavigationHistory());
        }

        if (shouldCloseUnorganized) {
          removeFromNavigationHistory('thread_unorganized');
        }
        
        // Refresh counts after a short delay to let the DB commit the deletion
        debouncedRefreshNavigationCounts();
      }
    };
    
    document.addEventListener('app:route-change', handlePageLoad);
    document.addEventListener('spaceCreated', handleSpaceCreated as EventListener);
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    document.addEventListener('threadCreated', handleThreadCreated as EventListener);
    window.addEventListener('threadDeleted', handleThreadDeleted as EventListener);
    window.addEventListener('noteCreated', handleNoteCreated as unknown as EventListener);
    window.addEventListener('noteDeleted', handleNoteDeleted as unknown as EventListener);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as unknown as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
    window.addEventListener('threadUpdated', handleThreadUpdated as unknown as EventListener);
    window.addEventListener('spaceUpdated', handleSpaceUpdated as unknown as EventListener);
    
    // Expose functions to global scope for non-React code
    (window as any).removeFromNavigationHistory = removeFromNavigationHistory;
    (window as any).addToNavigationHistory = addToNavigationHistory;
    (window as any).trackNavigationAccess = trackNavigationAccess;
    (window as any).refreshNavigation = refreshNavigation;
    
    return () => {
      // Clean up validation timeout if it exists
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
      document.removeEventListener('app:route-change', handlePageLoad);
      document.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
      document.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      window.removeEventListener('threadDeleted', handleThreadDeleted as EventListener);
      window.removeEventListener('noteCreated', handleNoteCreated as unknown as EventListener);
      window.removeEventListener('noteDeleted', handleNoteDeleted as unknown as EventListener);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as unknown as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
      window.removeEventListener('threadUpdated', handleThreadUpdated as unknown as EventListener);
      window.removeEventListener('spaceUpdated', handleSpaceUpdated as unknown as EventListener);
    };
  }, []);

  // Listen for entity ID changes (when local IDs become server IDs during sync)
  useEffect(() => {
    const handleIdChange = (event: CustomEvent) => {
      const { oldId, newId, entityType } = event.detail;
      
      // Update navigation history
      setNavigationHistory(prev => 
        prev.map(item => item.id === oldId ? { ...item, id: newId } : item)
      );
      
      // Update closed items if needed
      const closedItems = getClosedItems();
      if (closedItems.includes(oldId)) {
        // Remove old ID and add new ID to closed items
        removeFromClosedItems(oldId);
        addToClosedItems(newId);
      }
      
      // Update storage to persist the change (use raw history to preserve spaces)
      const rawHistory = getRawNavigationHistory();
      const updated = rawHistory.map((item: any) =>
        item.id === oldId ? { ...item, id: newId } : item
      );
      saveNavigationHistory(updated);
    };
    
    window.addEventListener('entityIdChanged', handleIdChange as EventListener);
    return () => {
      window.removeEventListener('entityIdChanged', handleIdChange as EventListener);
    };
  }, []);

  // Sync from localStorage when any code (e.g. history-tracker script) updates and dispatches navigationHistoryUpdated
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setNavigationHistory(getNavigationHistory());
    };
    window.addEventListener('navigationHistoryUpdated', handler);
    return () => window.removeEventListener('navigationHistoryUpdated', handler);
  }, []);

  // Memoize filtered navigation history to prevent recalculation on unrelated renders
  const filteredNavigationHistory = useMemo(() => {
    const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    return navigationHistory.filter(item => !testItemTitles.includes(item.title));
  }, [navigationHistory]);

  // Memoize context value to ensure React detects changes properly
  // The value object reference changes when navigationHistory changes, triggering re-renders
  const value: NavigationContextType = useMemo(() => {
    const newValue = {
      navigationHistory: filteredNavigationHistory,
      addToNavigationHistory,
      removeFromNavigationHistory,
      trackNavigationAccess,
      refreshNavigation,
      getCurrentActiveItemId,
      updateNavigationItemCount,
    };
    return newValue;
  }, [filteredNavigationHistory]);

  // Use default value during SSR, real value during client-side
  const contextValue = typeof window === 'undefined' ? defaultContextValue : value;

  return (
    <NavigationContext value={contextValue}>
      {children}
    </NavigationContext>
  );
};

// Hook to use navigation context
export const useNavigation = () => {
  const context = use(NavigationContext);
  
  // During SSR, return default context value
  if (typeof window === 'undefined') {
    return defaultContextValue;
  }
  
  // During client-side rendering, return default values if context is not available
  // This allows components to work even if not wrapped in NavigationProvider
  // (graceful degradation)
  if (context === undefined) {
    return defaultContextValue;
  }
  
  return context;
};

