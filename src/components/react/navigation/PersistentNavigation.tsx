import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Icon from '../Icon';
import { debug } from '@/utils/logger';
import { useSelectedSpaceId } from './selectedSpace';

interface PersistentNavigationProps {
  onSpaceSwitcherClick?: (event: React.MouseEvent) => void;
}

const PersistentNavigation: React.FC<PersistentNavigationProps> = ({ onSpaceSwitcherClick }) => {
  const contextValue = useNavigation();
  const { navigationHistory, removeFromNavigationHistory, getCurrentActiveItemId } = contextValue;
  const selectedSpaceId = useSelectedSpaceId();
  // Avoid React hydration mismatches:
  // - Server render can't compute persistent items (no window/localStorage)
  // - Client initial render may inject active thread from DOM and differ from SSR HTML
  // So we only render after mount.
  const [isHydrated, setIsHydrated] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

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
      requestAnimationFrame(() => {
        setRenderKey(prev => prev + 1);
      });
    };

    const handleNavigationUpdate = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      timeoutRef = setTimeout(() => {
        setRenderKey(prev => prev + 1);
      }, 50);
    };

    const handleThreadUpdated = () => {
      setRenderKey(prev => prev + 1);
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    document.addEventListener('astro:after-swap', handlePageLoad);
    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    window.addEventListener('threadUpdated', handleThreadUpdated);

    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('astro:after-swap', handlePageLoad);
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
      window.removeEventListener('threadUpdated', handleThreadUpdated);
    };
  }, []);

  const currentActiveItemId = typeof window !== 'undefined' ? getCurrentActiveItemId() : '';

  const getPersistentItems = () => {
    if (typeof window === 'undefined') return [];

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

        const title = noteEl?.dataset?.parentThreadTitle ?? navEl?.dataset?.parentThreadTitle ?? 'Thread';
        const countStr = noteEl?.dataset?.parentThreadCount ?? navEl?.dataset?.parentThreadCount ?? '0';
        const backgroundGradient =
          noteEl?.dataset?.parentThreadBackgroundGradient ??
          navEl?.dataset?.parentThreadBackgroundGradient ??
          'var(--color-gradient-gray)';
        const spaceId = noteEl?.dataset?.parentThreadSpaceId ?? navEl?.dataset?.parentThreadSpaceId ?? null;

        return {
          id: parentThreadId,
          title,
          count: parseInt(countStr || '0'),
          backgroundGradient,
          spaceId: spaceId || null,
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

    persistentItems = persistentItems.filter((item) => {
      if (item.id === 'thread_unorganized') {
        const isClosed = localStorage.getItem('unorganized-thread-closed') === 'true';
        if (isClosed && currentActiveItemId === 'thread_unorganized') {
          localStorage.removeItem('unorganized-thread-closed');
          return true;
        }
        return !isClosed;
      }
      return true;
    });

    // Compute the active parent thread *before* scoping so we can always include it.
    const activeParentThread = window.location.pathname.includes('/note_') ? getActiveParentThreadFromDom() : null;
    const activeThreadIdFromPath = (() => {
      try {
        const path = window.location.pathname || '/';
        const id = path.startsWith('/') ? path.slice(1) : path;
        return id.startsWith('thread_') ? id : null;
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

    // Scope threads to the selected space.
    // - If a space is selected: show items opened in that space.
    // - If "My Home" selected: show items opened while Home was selected (null scope).
    persistentItems = persistentItems.filter((item: any) => {
      if (item.id === 'thread_unorganized') return true;
      const scopes = getOpenedInSpaceIds(item);
      if (!selectedSpaceId) return scopes.some((s) => s == null);
      return scopes.some((s) => s === selectedSpaceId);
    });

    // Ensure the active thread is visible on thread pages, even if it doesn't match scoping.
    // Prefer the navigationHistory entry (better title/gradient/count); fall back to DOM dataset.
    if (activeThreadIdFromPath && !persistentItems.some((i) => i.id === activeThreadIdFromPath)) {
      const fromHistory = navigationHistory.find((i) => i.id === activeThreadIdFromPath);
      const fromDom = getActiveThreadFromDom();
      const activeThreadItem = fromHistory
        ? {
            id: fromHistory.id,
            title: fromHistory.title,
            count: fromHistory.count || 0,
            backgroundGradient: fromHistory.backgroundGradient || 'var(--color-gradient-gray)',
            spaceId: (fromHistory as any).spaceId ?? null,
          }
        : fromDom;
      
      // CRITICAL: Don't add if this is a thread titled "Unorganized" but with wrong ID
      // This prevents duplicate "Unorganized" items when a renamed thread conflicts with thread_unorganized
      const isUnorganizedTitleWithWrongId = 
        activeThreadItem && 
        activeThreadItem.title === 'Unorganized' && 
        activeThreadItem.id !== 'thread_unorganized';
      
      // Also check if "Unorganized" already exists by title (not just ID)
      const unorganizedAlreadyExists = persistentItems.some((i) => i.title === 'Unorganized');
      
      if (activeThreadItem && !isUnorganizedTitleWithWrongId && !unorganizedAlreadyExists) {
        persistentItems = [activeThreadItem, ...persistentItems];
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
      
      if (!isUnorganizedTitleWithWrongId && !unorganizedAlreadyExists) {
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

  return (
    <div id="persistent-navigation" key={renderKey} className="persistent-nav">
      {persistentItems.map((item) => {
        const isActive = item.id === currentActiveItemId;
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

        const getThreadHrefWithSpace = () => {
          // Keep the space switcher pinned to the *current* selected space.
          // (Visibility is controlled by opened-in scopes.)
          const hasSpace = typeof selectedSpaceId === 'string' && selectedSpaceId.startsWith('space_');
          return hasSpace ? `/${item.id}?space=${encodeURIComponent(selectedSpaceId)}` : `/${item.id}`;
        };

        // CRITICAL: Ensure href is always valid - never set to /undefined
        const validHref = item.id.startsWith('thread_') ? getThreadHrefWithSpace() : `/${item.id}`;

        return (
          <div
            key={item.id}
            data-navigation-item={item.id}
            className={`nav-item-container ${isSpaceItem ? 'nav-item-container--space' : ''}`}
          >
            <div className="nav-item-wrapper">
              <a href={validHref} className="nav-link">
                <SpaceButton
                  as="div"
                  text={item.title}
                  count={item.count || 0}
                  state="WithCount"
                  rightAccessory={isSpaceItem ? 'spaceSwitcher' : 'count'}
                  onRightAccessoryClick={isSpaceItem ? onSpaceSwitcherClick : undefined}
                  backgroundGradient={item.backgroundGradient || "var(--color-paper)"}
                  isActive={isActive}
                  itemId={item.id}
                />
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromNavigationHistory(item.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className="close-icon"
                data-item-id={item.id}
                aria-label={`Close ${item.title || 'item'}`}
              >
                <Icon name="xmark" size="14px" style={{ color: 'var(--color-deep-grey)' }} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PersistentNavigation;
