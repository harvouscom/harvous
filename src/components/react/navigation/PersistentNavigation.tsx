import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Icon from '../Icon';
import { debug } from '@/utils/logger';
import { idToUrl, extractIdFromPath, detectEntityTypeFromPath } from '@/utils/url-helpers';
import { useSelectedSpaceId, getSelectedSpaceId } from './selectedSpace';
import { getBackTarget, popNavStack } from '@/utils/nav-stack';
import { safeNavigate } from '@/utils/safe-navigate';

interface ActiveThreadProp {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient?: string;
  spaceId?: string | null;
}

interface PersistentNavigationProps {
  onSpaceSwitcherClick?: (event: React.MouseEvent) => void;
  /** SSR-provided active thread (e.g. from layout when viewing a note). First-priority source for active parent thread, same as mobile. */
  activeThread?: ActiveThreadProp | null;
}

const PAPER_GRADIENT = 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)';

const PersistentNavigation: React.FC<PersistentNavigationProps> = ({ onSpaceSwitcherClick, activeThread: activeThreadProp }) => {
  const contextValue = useNavigation();
  const { navigationHistory, removeFromNavigationHistory, getCurrentActiveItemId } = contextValue;
  const selectedSpaceId = useSelectedSpaceId();
  // Avoid React hydration mismatches:
  // - Server render can't compute persistent items (no window/localStorage)
  // - Client initial render may inject active thread from DOM and differ from SSR HTML
  // So we only render after mount.
  const [isHydrated, setIsHydrated] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : ''
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Force re-render when navigationHistory changes
  useEffect(() => {
    setRenderKey(prev => prev + 1);
  }, [navigationHistory]);

  // Listen for page changes to update current item
  useEffect(() => {
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;

    const handlePageLoad = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      if (typeof window !== 'undefined') setPathname(window.location.pathname);
      requestAnimationFrame(() => {
        setRenderKey(prev => prev + 1);
      });
    };

    const handleNavigationUpdate = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      setRenderKey(prev => prev + 1);
    };

    const handleThreadUpdated = () => {
      setRenderKey(prev => prev + 1);
    };

    const handleSpaceUpdated = () => {
      setRenderKey(prev => prev + 1);
    };

    document.addEventListener('app:route-change', handlePageLoad);
    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    window.addEventListener('threadUpdated', handleThreadUpdated);
    window.addEventListener('spaceUpdated', handleSpaceUpdated);

    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      document.removeEventListener('app:route-change', handlePageLoad);
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
      window.removeEventListener('threadUpdated', handleThreadUpdated);
      window.removeEventListener('spaceUpdated', handleSpaceUpdated);
    };
  }, []);

  // Remove dropped (same-title, different-id) thread ids from history so closing never navigates to a stale id
  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return;
    let currentId: string | null = null;
    let currentTitle: string | null = null;
    if (pathname.startsWith('/note/')) {
      const noteEl = document.querySelector('[data-note-id][data-parent-thread-id]') as HTMLElement | null;
      const navEl = document.querySelector('[data-navigation-active="true"]') as HTMLElement | null;
      const rawId = noteEl?.dataset?.parentThreadId ?? navEl?.dataset?.parentThreadId ?? null;
      currentId = rawId ? String(rawId).replace(/^\/+/, '').replace(/\/+$/, '') : null;
      if (currentId?.startsWith('thread_')) {
        currentTitle = noteEl?.dataset?.parentThreadTitle ?? navEl?.dataset?.parentThreadTitle ?? 'Thread';
      } else {
        currentId = null;
      }
    } else if (pathname.startsWith('/thread/')) {
      const pathId = extractIdFromPath(pathname);
      if (pathId && pathId.startsWith('thread_')) {
        currentId = pathId;
        const fromHistory = navigationHistory.find((i) => i.id === pathId);
        currentTitle = fromHistory?.title ?? null;
        if (currentTitle == null) {
          const navEl = document.querySelector('[data-navigation-active="true"]') as HTMLElement | null;
          currentTitle = navEl?.dataset?.threadTitle ?? 'Thread';
        }
      }
    }
    if (!currentId || !currentTitle) return;
    const dropped = navigationHistory.filter(
      (item) => item.id?.startsWith('thread_') && item.title === currentTitle && item.id !== currentId
    );
    dropped.forEach((item) => removeFromNavigationHistory(item.id, { navigateIfActive: false }));
  }, [navigationHistory, pathname, removeFromNavigationHistory]);

  const currentActiveItemId = typeof window !== 'undefined' ? getCurrentActiveItemId() : '';

  const getPersistentItems = () => {
    if (typeof window === 'undefined') return [];

    const isRecentlyClosed = (itemId: string, withinMs = 2500): boolean => {
      try {
        const raw = window.sessionStorage?.getItem('harvous-recently-closed-items');
        if (!raw) return false;
        const entries: Array<{ itemId?: string; closedAt?: number }> = JSON.parse(raw);
        if (!Array.isArray(entries)) return false;
        const since = Date.now() - withinMs;
        return entries.some(
          (e) => e?.itemId === itemId && typeof e?.closedAt === 'number' && e.closedAt >= since
        );
      } catch {
        return false;
      }
    };

    const GRAY_FALLBACK = 'var(--color-gradient-gray)';
    const isRealGradient = (g: string | undefined): boolean =>
      !!(g && g !== GRAY_FALLBACK && g !== 'var(--color-paper)' && g !== PAPER_GRADIENT);

    const getGradientFromHistory = (threadId: string): string | undefined => {
      const item = navigationHistory.find((i: any) => i.id === threadId);
      const g = item?.backgroundGradient;
      return g && isRealGradient(g) ? g : undefined;
    };

    // When viewing a note page, always ensure its parent thread is visible in the nav.
    // View Transitions and timing can cause navigationHistory to miss/lose the parent thread briefly;
    // this keeps the UI consistent and avoids "missing thread" cases.
    const getActiveParentThreadFromDom = (): any | null => {
      try {
        // Prefer elements that are known to have the parent thread attributes.
        const noteEl = document.querySelector('[data-note-id][data-parent-thread-id]') as HTMLElement | null;
        // Don't rely on the `slot` attribute at runtime; use the stable wrapper marker.
        const navEl = document.querySelector('[data-navigation-active="true"]') as HTMLElement | null;

        const rawParentThreadId = noteEl?.dataset?.parentThreadId ?? navEl?.dataset?.parentThreadId ?? null;
        const parentThreadId = rawParentThreadId ? String(rawParentThreadId).replace(/^\/+/, '').replace(/\/+$/, '') : null;
        if (!parentThreadId || !parentThreadId.startsWith('thread_')) return null;

        let title = noteEl?.dataset?.parentThreadTitle ?? navEl?.dataset?.parentThreadTitle ?? 'Thread';
        if (parentThreadId === 'thread_unorganized') title = 'Unorganized';
        const countStr = noteEl?.dataset?.parentThreadCount ?? navEl?.dataset?.parentThreadCount ?? '0';
        let backgroundGradient =
          noteEl?.dataset?.parentThreadBackgroundGradient ??
          navEl?.dataset?.parentThreadBackgroundGradient ??
          GRAY_FALLBACK;
        if (!backgroundGradient || backgroundGradient === GRAY_FALLBACK) {
          const fromHistory = getGradientFromHistory(parentThreadId);
          if (fromHistory) backgroundGradient = fromHistory;
        }
        const spaceId = noteEl?.dataset?.parentThreadSpaceId ?? navEl?.dataset?.parentThreadSpaceId ?? null;

        const now = Date.now();
        return {
          id: parentThreadId,
          title,
          count: parseInt(countStr || '0'),
          backgroundGradient,
          spaceId: spaceId || null,
          firstAccessed: now,
          lastAccessed: now,
        };
      } catch {
        return null;
      }
    };

    // CRITICAL: Filter out items with invalid IDs (undefined, null, empty string)
    // This prevents navigation to invalid URLs like /undefined
    let persistentItems = navigationHistory.filter((item) => {
      // Validate item has a valid ID
      if (!item || !item.id || typeof item.id !== 'string' || item.id.trim() === '') {
        console.warn('[PersistentNavigation] Filtering out item with invalid ID:', item);
        return false;
      }

      if (item.id === 'dashboard') return false;
      // Spaces should not render as persistent nav buttons on desktop
      if (item.id.startsWith('space_')) return false;
      return true;
    });

    // Exclude recently closed items so they never appear (e.g. when closing the active thread,
    // state/refresh can lag and the item may still be in navigationHistory; this hides it).
    persistentItems = persistentItems.filter((item) => !isRecentlyClosed(item.id));

    // Compute the active parent thread *before* scoping so we can always include it.
    // First priority: SSR-provided activeThread (same as mobile's currentThread) - most stable, avoids View Transition timing.
    let activeParentThread: { id: string; title: string; count: number; backgroundGradient: string; spaceId: string | null; firstAccessed: number; lastAccessed: number } | null = null;
    if (window.location.pathname.startsWith('/note/')) {
      if (activeThreadProp?.id && activeThreadProp.id.startsWith('thread_')) {
        const now = Date.now();
        // If activeThreadProp has default/fallback title ('Thread') or no gradient,
        // check navigation history for better data before using defaults.
        const fromHistory = navigationHistory.find((i) => i.id === activeThreadProp.id);
        const propTitle = activeThreadProp.id === 'thread_unorganized' ? 'Unorganized' : (activeThreadProp.title || '');
        const hasRealTitle = propTitle && propTitle !== 'Thread';
        const hasRealGradient = activeThreadProp.backgroundGradient && activeThreadProp.backgroundGradient !== 'var(--color-gradient-gray)';
        activeParentThread = {
          id: activeThreadProp.id,
          title: hasRealTitle ? propTitle : (fromHistory?.title || propTitle || 'Thread'),
          count: activeThreadProp.noteCount ?? fromHistory?.count ?? 0,
          backgroundGradient: hasRealGradient ? activeThreadProp.backgroundGradient! : (fromHistory?.backgroundGradient || activeThreadProp.backgroundGradient || 'var(--color-gradient-gray)'),
          spaceId: activeThreadProp.spaceId ?? (fromHistory as any)?.spaceId ?? null,
          firstAccessed: fromHistory?.firstAccessed ?? now,
          lastAccessed: now,
        };
      }
      if (!activeParentThread) {
        activeParentThread = getActiveParentThreadFromDom();
      }
      // Fallback when DOM hasn't updated yet (View Transitions): use getCurrentActiveItemId (sessionStorage + fallback)
      if (activeParentThread === null) {
        const fallbackThreadId = getCurrentActiveItemId();
        if (fallbackThreadId === 'thread_unorganized') {
          const now = Date.now();
          activeParentThread = {
            id: 'thread_unorganized',
            title: 'Unorganized',
            count: 1,
            backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
            spaceId: null,
            firstAccessed: now,
            lastAccessed: now,
          };
        }
      }
      // When activeParentThread still has gray/missing gradient, use navigationHistory if it has a real color
      if (activeParentThread && !isRealGradient(activeParentThread.backgroundGradient)) {
        const fromHistory = getGradientFromHistory(activeParentThread.id);
        if (fromHistory) {
          activeParentThread = { ...activeParentThread, backgroundGradient: fromHistory };
        }
      }
    }
    const activeThreadIdFromPath = (() => {
      try {
        const path = window.location.pathname || '/';
        const id = extractIdFromPath(path);
        return id && id.startsWith('thread_') ? id : null;
      } catch {
        return null;
      }
    })();

    const getActiveThreadFromDom = (): any | null => {
      try {
        const navEl = document.querySelector('[data-navigation-active="true"]') as HTMLElement | null;
        const threadId = navEl?.dataset?.threadId ?? null;
        if (!threadId || !threadId.startsWith('thread_')) return null;
        return {
          id: threadId,
          title: navEl?.dataset?.threadTitle || 'Thread',
          count: parseInt(navEl?.dataset?.threadNoteCount || '0'),
          backgroundGradient: navEl?.dataset?.threadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: navEl?.dataset?.threadSpaceId || null,
        };
      } catch {
        return null;
      }
    };

    const getOpenedInSpaceIds = (item: any): Array<string | null> => {
      if (Array.isArray(item?.openedInSpaceIds)) return item.openedInSpaceIds as Array<string | null>;
      // Back-compat: single scope or fallback to thread's spaceId
      return [item?.openedInSpaceId ?? item?.spaceId ?? null];
    };

    // Route-based scope for filtering: on dashboard show only Home threads; on space page show that space's threads.
    const isDashboardRoute = pathname === '/' || pathname === '/dashboard';
    const spaceIdForFilter = isDashboardRoute ? null : selectedSpaceId;

    // Scope threads to the current view (route), not storage.
    // - On dashboard: show items opened in Home (null scope).
    // - On space page: show items opened in that space.
    persistentItems = persistentItems.filter((item: any) => {
      const scopes = getOpenedInSpaceIds(item);
      return !spaceIdForFilter ? scopes.some((s) => s == null) : scopes.some((s) => s === spaceIdForFilter);
    });

    // Ensure the active thread is visible on thread pages, but ONLY if the URL space
    // matches the current view. When the user switches spaces while viewing
    // a thread, the thread should NOT be force-added to the new space's sidebar.
    const activeThreadSpaceMatchesCurrent = (() => {
      try {
        const urlSpace = new URLSearchParams(window.location.search).get('space');
        if (urlSpace && urlSpace.startsWith('space_')) return urlSpace === spaceIdForFilter;
        return !spaceIdForFilter;
      } catch {
        return false;
      }
    })();

    // Prefer the navigationHistory entry (better title/gradient/count); fall back to DOM dataset.
    if (activeThreadIdFromPath && activeThreadSpaceMatchesCurrent && !persistentItems.some((i) => i.id === activeThreadIdFromPath)) {
      const fromHistory = navigationHistory.find((i) => i.id === activeThreadIdFromPath);
      const fromDom = getActiveThreadFromDom();
      // Build the best available thread data, preferring activeThreadProp (live React data)
      // over fromHistory (may be stale) over fromDom (doesn't work in SPA).
      const now = Date.now();
      const activeThreadItem = (activeThreadProp?.id === activeThreadIdFromPath)
        ? {
            id: activeThreadProp.id,
            title: activeThreadProp.id === 'thread_unorganized' ? 'Unorganized' : (activeThreadProp.title || fromHistory?.title || 'Thread'),
            count: activeThreadProp.noteCount ?? fromHistory?.count ?? 0,
            backgroundGradient: activeThreadProp.backgroundGradient || fromHistory?.backgroundGradient || 'var(--color-gradient-gray)',
            spaceId: activeThreadProp.spaceId ?? (fromHistory as any)?.spaceId ?? null,
            firstAccessed: fromHistory?.firstAccessed ?? now,
            lastAccessed: now,
          }
        : fromHistory
          ? {
              id: fromHistory.id,
              title: fromHistory.id === 'thread_unorganized' ? 'Unorganized' : fromHistory.title,
              count: fromHistory.count || 0,
              backgroundGradient: fromHistory.id === 'thread_unorganized'
                ? PAPER_GRADIENT
                : (fromHistory.backgroundGradient || 'var(--color-gradient-gray)'),
              spaceId: (fromHistory as any).spaceId ?? null,
              firstAccessed: fromHistory.firstAccessed,
              lastAccessed: fromHistory.lastAccessed,
            }
          : fromDom
            ? {
                ...fromDom,
                title: fromDom.id === 'thread_unorganized' ? 'Unorganized' : (fromDom.title || 'Thread'),
              }
            : null;

      // CRITICAL: Don't add if this is a thread titled "Unorganized" but with wrong ID
      // This prevents duplicate "Unorganized" items when a renamed thread conflicts with thread_unorganized
      const isUnorganizedTitleWithWrongId =
        activeThreadItem &&
        activeThreadItem.title === 'Unorganized' &&
        activeThreadItem.id !== 'thread_unorganized';

      // Also check if "Unorganized" already exists by title (not just ID)
      const unorganizedAlreadyExists = persistentItems.some((i) => i.title === 'Unorganized');

      if (
        activeThreadItem &&
        !isUnorganizedTitleWithWrongId &&
        !unorganizedAlreadyExists &&
        !isRecentlyClosed(activeThreadItem.id)
      ) {
        // Collapse same-title duplicates in favor of current page's thread
        persistentItems = persistentItems.filter(
          (i) => !(i.title === activeThreadItem.title && i.id !== activeThreadItem.id)
        );
        // Insert at the correct chronological position (by firstAccessed) rather than
        // prepending — prepend was causing the thread to appear ahead of older items.
        persistentItems = [...persistentItems, activeThreadItem];
        persistentItems.sort((a: any, b: any) => {
          const aFirst = a.firstAccessed ?? Number.MAX_SAFE_INTEGER;
          const bFirst = b.firstAccessed ?? Number.MAX_SAFE_INTEGER;
          return aFirst - bFirst;
        });
      }
    }

    // When the active thread IS in persistentItems but might have stale data (wrong title/color),
    // update it with fresh data from activeThreadProp if available.
    if (activeThreadIdFromPath && activeThreadProp?.id === activeThreadIdFromPath) {
      const GRAY_FALLBACK = 'var(--color-gradient-gray)';
      persistentItems = persistentItems.map((item) => {
        if (item.id !== activeThreadIdFromPath) return item;
        const propTitle = activeThreadProp.id === 'thread_unorganized' ? 'Unorganized' : (activeThreadProp.title || item.title);
        const propGradient = activeThreadProp.backgroundGradient || item.backgroundGradient;
        // Only update if prop data is meaningfully different/better
        const titleChanged = propTitle && propTitle !== 'Thread' && propTitle !== item.title;
        const gradientChanged = propGradient && propGradient !== GRAY_FALLBACK && propGradient !== item.backgroundGradient;
        if (titleChanged || gradientChanged) {
          return {
            ...item,
            title: propTitle || item.title,
            count: activeThreadProp.noteCount ?? item.count,
            backgroundGradient: propGradient || item.backgroundGradient,
          };
        }
        return item;
      });
    }

    // On note page: collapse same-title duplicates in favor of current page's parent thread
    if (activeParentThread) {
      persistentItems = persistentItems.filter(
        (i) => !(i.title === activeParentThread.title && i.id !== activeParentThread.id)
      );
      // If the thread is already in the list but with a stale/missing gradient, update it
      const GRAY_FALLBACK = 'var(--color-gradient-gray)';
      const hasRealGradient = activeParentThread.backgroundGradient &&
        activeParentThread.backgroundGradient !== GRAY_FALLBACK;
      if (hasRealGradient) {
        persistentItems = persistentItems.map((i) =>
          i.id === activeParentThread.id && (!i.backgroundGradient || i.backgroundGradient === GRAY_FALLBACK)
            ? { ...i, backgroundGradient: activeParentThread.backgroundGradient }
            : i
        );
      }
    }
    // Ensure the active parent thread is visible even if it doesn't match scoping yet.
    if (activeParentThread && !persistentItems.some((i) => i.id === activeParentThread.id)) {
      // CRITICAL: Don't add if this is a thread titled "Unorganized" but with wrong ID
      // This prevents duplicate "Unorganized" items when a renamed thread conflicts with thread_unorganized
      const isUnorganizedTitleWithWrongId = 
        activeParentThread.title === 'Unorganized' && 
        activeParentThread.id !== 'thread_unorganized';
      
      // Also check if "Unorganized" already exists by title (not just ID)
      const unorganizedAlreadyExists = persistentItems.some((i) => i.title === 'Unorganized');
      
      if (
        !isUnorganizedTitleWithWrongId &&
        !unorganizedAlreadyExists &&
        !isRecentlyClosed(activeParentThread.id)
      ) {
        persistentItems = [activeParentThread, ...persistentItems];
      }
    }

    // CRITICAL: Final deduplication to prevent duplicate items from being rendered
    // This handles race conditions where an item might be added from multiple sources
    // (e.g., from navigationHistory and from DOM fallback logic)
    const seen = new Set<string>();
    persistentItems = persistentItems.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });

    return persistentItems;
  };

  // Keep SSR + initial client render consistent to prevent hydration mismatch.
  // IMPORTANT: do not early-return before hooks (Rules of Hooks).
  const persistentItems = isHydrated ? getPersistentItems() : [];

  // Debug logging for navigation state (development only)
  useEffect(() => {
    debug('[PersistentNavigation] Component state', {
      navigationHistoryLength: navigationHistory.length,
      persistentItemsCount: persistentItems.length,
      contextValueExists: !!contextValue
    });
  }, [navigationHistory, persistentItems, contextValue]);


  if (persistentItems.length === 0) {
    return null;
  }

  // Debug: Log persistent items (development only)
  if (typeof window !== 'undefined') {
    debug('[PersistentNavigation] Rendering persistent items', {
      items: persistentItems.map(item => ({
        id: item.id,
        title: item.title
      }))
    });
  }

  // Use window.location.pathname directly for active-item detection.
  // The `pathname` state variable can lag behind window.location during SPA navigation
  // (updated via app:route-change event which fires after render).
  const livePath = typeof window !== 'undefined' ? window.location.pathname : pathname;

  // On note page, use same source as list (SSR activeThread first, then DOM) so active state matches the displayed thread
  let effectiveActiveItemId = currentActiveItemId;
  if (typeof window !== 'undefined' && livePath.startsWith('/note/')) {
    // First priority: SSR-provided activeThread (same as list) - avoids View Transition timing
    if (activeThreadProp?.id && activeThreadProp.id.startsWith('thread_')) {
      effectiveActiveItemId = activeThreadProp.id;
    } else {
      try {
        const noteEl = document.querySelector('[data-note-id][data-parent-thread-id]') as HTMLElement | null;
        const navEl = document.querySelector('[data-navigation-active="true"]') as HTMLElement | null;
        const raw =
          noteEl?.dataset?.parentThreadId ?? navEl?.dataset?.parentThreadId ?? null;
        const id = raw ? String(raw).replace(/^\/+/, '').replace(/\/+$/, '') : null;
        if (id && id.startsWith('thread_')) {
          effectiveActiveItemId = id;
        }
      } catch {
        // keep currentActiveItemId
      }
    }
  }
  // Thread pages: use activeThreadProp as a stable source in SPA mode
  // (DOM data attributes don't exist in SPA, so getCurrentActiveItemId may lag)
  if (typeof window !== 'undefined' && livePath.startsWith('/thread/')) {
    if (activeThreadProp?.id && activeThreadProp.id.startsWith('thread_')) {
      effectiveActiveItemId = activeThreadProp.id;
    }
  }

  return (
    <div id="persistent-navigation" className="persistent-nav">
      {persistentItems.map((item) => {
        const isActive = item.id === effectiveActiveItemId;
        const isSpaceItem = item.id.startsWith('space_');

        // Skip rendering if item.id is invalid (shouldn't happen due to filter, but double-check)
        // CRITICAL: This prevents href from being set to /undefined which causes navigation failures
        if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
          console.error('[PersistentNavigation] Skipping render for item with invalid ID:', {
            item: item,
            itemId: item.id,
            itemTitle: item.title,
            itemType: typeof item.id
          });
          return null;
        }

        // CRITICAL: Double-check item.id is valid before rendering
        // This is the final safety check before creating the href
        if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
          console.error('[PersistentNavigation] CRITICAL: Skipping render - item.id is invalid:', {
            item: item,
            itemId: item.id,
            itemTitle: item.title
          });
          return null;
        }

        // CRITICAL: Validate format before creating href
        if (!item.id.startsWith('thread_') && !item.id.startsWith('space_') && !item.id.startsWith('note_')) {
          console.error('[PersistentNavigation] CRITICAL: Skipping render - item.id has invalid format:', {
            itemId: item.id,
            itemTitle: item.title
          });
          return null;
        }

        let spaceForLink: string | null = selectedSpaceId ?? getSelectedSpaceId();
        const getThreadHrefWithSpace = () => {
          // Use the current space so threads always open in the space the user is viewing.
          // Fall back to getSelectedSpaceId() (direct storage read) in case React state
          // hasn't hydrated yet, then check the URL query param as a last resort.
          if (typeof window !== 'undefined') {
            try {
              const fromUrl = new URLSearchParams(window.location.search).get('space');
              if (fromUrl && fromUrl.startsWith('space_')) spaceForLink = fromUrl;
            } catch {
              // ignore
            }
          }
          const hasSpace = typeof spaceForLink === 'string' && spaceForLink.startsWith('space_');
          return hasSpace ? `${idToUrl(item.id)}?space=${encodeURIComponent(spaceForLink!)}` : idToUrl(item.id);
        };

        // CRITICAL: Ensure href is always valid - never set to /undefined
        const validHref = item.id.startsWith('thread_') ? getThreadHrefWithSpace() : idToUrl(item.id);

        return (
          <div
            key={item.id}
            data-navigation-item={item.id}
            className={`nav-item-container ${isSpaceItem ? 'nav-item-container--space' : ''}`}
          >
            <div className="nav-item-wrapper">
              <a
                href={validHref}
                className="nav-link"
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  const noteIdFromPath = extractIdFromPath(window.location.pathname);
                  const noteIdFromDom = (document.querySelector('[data-note-id]') as HTMLElement | null)?.dataset.noteId ?? null;
                  const currentNoteId = (noteIdFromPath?.startsWith('note_') ? noteIdFromPath : null)
                    ?? (noteIdFromDom?.startsWith('note_') ? noteIdFromDom : null);
                  if (!currentNoteId) return;
                  let noteThreadId: string | null = null;
                  try {
                    const fromQuery = new URLSearchParams(window.location.search).get('thread');
                    if (fromQuery && fromQuery.startsWith('thread_')) noteThreadId = fromQuery;
                  } catch {
                    // ignore
                  }
                  if (!noteThreadId) {
                    try {
                      const cached = localStorage.getItem(`harvous-note-thread-${currentNoteId}`);
                      if (cached && cached.startsWith('thread_')) noteThreadId = cached;
                    } catch {
                      // ignore
                    }
                  }
                  if (!noteThreadId) {
                    const noteEl = document.querySelector('[data-note-id]') as HTMLElement | null;
                    if (noteEl?.dataset.parentThreadId?.startsWith('thread_')) {
                      noteThreadId = noteEl.dataset.parentThreadId;
                    }
                  }
                  if (!noteThreadId || noteThreadId !== item.id) return;
                  const backTarget = getBackTarget(currentNoteId, item.id, spaceForLink);
                  if (backTarget.startsWith('/note/')) {
                    e.preventDefault();
                    popNavStack(item.id);
                    safeNavigate(backTarget);
                  }
                }}
              >
                <SpaceButton
                  as="div"
                  text={item.id === 'thread_unorganized' ? 'Unorganized' : item.title}
                  count={
                    isActive && activeThreadProp?.id === item.id
                      ? Math.max(activeThreadProp.noteCount ?? 0, item.count ?? 0)
                      : (item.count || 0)
                  }
                  state="WithCount"
                  rightAccessory={isSpaceItem ? 'spaceSwitcher' : 'count'}
                  onRightAccessoryClick={isSpaceItem ? onSpaceSwitcherClick : undefined}
                  backgroundGradient={item.id === 'thread_unorganized' ? PAPER_GRADIENT : (item.backgroundGradient || "var(--color-paper)")}
                  isActive={isActive}
                  itemId={item.id}
                />
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromNavigationHistory(
                    item.id,
                    item.id.startsWith('thread_') ? { sameTitleAs: item.title } : undefined
                  );
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className="close-icon"
                data-item-id={item.id}
                aria-label={`Close ${item.title || 'item'}`}
              >
                <Icon name="xmark" size={14} style={{ color: 'var(--color-deep-grey)' }} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PersistentNavigation;
