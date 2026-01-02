import React, { useEffect, useRef } from 'react';
import { isPWA } from '@/utils/content-list-helpers';
import { debug } from '@/utils/logger';

interface UsePWAAndNavigationRefreshOptions {
  /**
   * Function to call when refresh is needed
   */
  onRefresh: () => void | Promise<void>;
  
  /**
   * Check if we should refresh based on current location
   * Return true if we're on the correct page for this component
   */
  shouldRefreshForLocation?: () => boolean;
  
  /**
   * Check if we should refresh on mount
   * Return true if we should refresh when component mounts
   */
  shouldRefreshOnMount?: () => boolean;
  
  /**
   * Get relevant item ID from sessionStorage (for verification-based refresh)
   * Return { itemId, itemType } if found, null otherwise
   */
  getRelevantItemFromStorage?: () => { itemId: string; itemType?: string } | null;
  
  /**
   * Minimum time in background before refreshing (default: 30 seconds)
   */
  minBackgroundTime?: number;
  
  /**
   * Minimum time between refreshes (default: 2 seconds)
   */
  minRefreshInterval?: number;
  
  /**
   * Delay before refresh for PWA (default: 300ms)
   */
  pwaRefreshDelay?: number;
  
  /**
   * Component identifier for debug logging
   */
  componentName?: string;
  
  /**
   * Refs to track component state
   */
  refs?: {
    isMounted?: React.MutableRefObject<boolean>;
    isRefreshing?: React.MutableRefObject<boolean>;
    isNavigating?: React.MutableRefObject<boolean>;
    hasRefreshedOnMount?: React.MutableRefObject<boolean>;
  };
}

/**
 * Hook for handling PWA foreground refresh and navigation-based refresh
 * Consolidates visibility change and navigation event handling
 */
export function usePWAAndNavigationRefresh(options: UsePWAAndNavigationRefreshOptions) {
  const {
    onRefresh,
    shouldRefreshForLocation = () => true,
    shouldRefreshOnMount,
    getRelevantItemFromStorage,
    minBackgroundTime = 30000,
    minRefreshInterval = 2000,
    pwaRefreshDelay = 300,
    componentName = 'Component',
    refs = {}
  } = options;

  const {
    isMounted = { current: true },
    isRefreshing = { current: false },
    isNavigating = { current: false },
    hasRefreshedOnMount = { current: false }
  } = refs;

  const lastBackgroundTimeRef = useRef<number>(0);
  const lastVisibilityRefreshRef = useRef<number>(0);
  const previousPathnameRef = useRef<string>(
    typeof window !== 'undefined' ? window.location.pathname : ''
  );
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle visibility changes (PWA foreground refresh)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - record time
        lastBackgroundTimeRef.current = Date.now();
      } else {
        // App came to foreground
        if (!shouldRefreshForLocation()) return;

        const timeInBackground = lastBackgroundTimeRef.current > 0
          ? Date.now() - lastBackgroundTimeRef.current
          : 0;
        const timeSinceLastRefresh = Date.now() - lastVisibilityRefreshRef.current;
        const inPWA = isPWA();

        // Only refresh if:
        // 1. Was in background for > minBackgroundTime, OR
        // 2. This is PWA (always refresh for PWA on foreground), OR
        // 3. First time coming to foreground (lastBackgroundTimeRef was 0)
        const shouldRefresh = (timeInBackground > minBackgroundTime || inPWA || lastBackgroundTimeRef.current === 0) &&
                              timeSinceLastRefresh > minRefreshInterval &&
                              !isNavigating.current &&
                              !isRefreshing.current &&
                              !hasRefreshedOnMount.current &&
                              isMounted.current;

        if (shouldRefresh) {
          lastVisibilityRefreshRef.current = Date.now();
          isRefreshing.current = true;

          debug(`[${componentName}] Visibility change: refreshing`, {
            timeInBackground,
            inPWA,
            timeSinceLastRefresh
          });

          // Clear any pending refresh timeout
          if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = null;
          }

          // Add delay for PWA to allow database commits
          const delay = inPWA ? pwaRefreshDelay : 0;
          refreshTimeoutRef.current = setTimeout(() => {
            refreshTimeoutRef.current = null;
            if (isMounted.current && shouldRefreshForLocation() && !isNavigating.current && isRefreshing.current) {
              Promise.resolve(onRefresh()).then(() => {
                isRefreshing.current = false;
                debug(`[${componentName}] Visibility refresh completed`);
              }).catch((error) => {
                isRefreshing.current = false;
                console.error(`[${componentName}] Visibility refresh failed:`, error);
              });
            } else {
              isRefreshing.current = false;
            }
          }, delay);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [onRefresh, shouldRefreshForLocation, minBackgroundTime, minRefreshInterval, pwaRefreshDelay, componentName, isMounted, isRefreshing, isNavigating, hasRefreshedOnMount]);

  // Handle navigation refresh (View Transitions)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const DEBOUNCE_MS = 300;

    const handlePageLoad = () => {
      // Clear any pending refresh
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      const currentPath = window.location.pathname;
      const previousPath = previousPathnameRef.current;

      // Check if we should refresh based on navigation
      const shouldForceRefresh = shouldRefreshForLocation();

      if (shouldForceRefresh) {
        // Check sessionStorage for recently created items
        let hasRecentItem = false;
        let relevantItem: { itemId: string; itemType?: string } | null = null;
        
        if (getRelevantItemFromStorage) {
          relevantItem = getRelevantItemFromStorage();
          hasRecentItem = !!relevantItem;
        }

        // Debounce to prevent multiple rapid refreshes
        refreshTimeoutRef.current = setTimeout(() => {
          refreshTimeoutRef.current = null;
          if (isMounted.current && shouldRefreshForLocation() && !isNavigating.current) {
            Promise.resolve(onRefresh()).catch((error) => {
              console.error(`[${componentName}] Navigation refresh failed:`, error);
            });
          }
        }, DEBOUNCE_MS);
      }

      // Update previous pathname for next navigation
      previousPathnameRef.current = currentPath;
    };

    const handleBeforePreparation = () => {
      previousPathnameRef.current = window.location.pathname;
    };

    // Initialize previous pathname on mount
    if (previousPathnameRef.current === '') {
      previousPathnameRef.current = window.location.pathname;
    }

    // Check on mount if we should refresh
    if (shouldRefreshOnMount && shouldRefreshOnMount()) {
      hasRefreshedOnMount.current = true;
      const delay = isPWA() ? pwaRefreshDelay : 0;
      setTimeout(() => {
        if (isMounted.current && shouldRefreshForLocation() && !isNavigating.current) {
          Promise.resolve(onRefresh()).catch((error) => {
            console.error(`[${componentName}] Mount refresh failed:`, error);
          });
        }
      }, delay);
    }

    document.addEventListener('astro:page-load', handlePageLoad);
    document.addEventListener('astro:before-preparation', handleBeforePreparation);

    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('astro:before-preparation', handleBeforePreparation);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [onRefresh, shouldRefreshForLocation, shouldRefreshOnMount, getRelevantItemFromStorage, componentName, isMounted, isNavigating, hasRefreshedOnMount, pwaRefreshDelay]);

  return {
    previousPathnameRef,
    refreshTimeoutRef
  };
}

