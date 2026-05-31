import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const COOLDOWN_MS = 400;

export interface UseIntersectionFetchNextPageOptions {
  scrollRootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void | Promise<unknown>;
  /** IntersectionObserver rootMargin; default 200px bottom prefetch for sidebar */
  rootMargin?: string;
}

export interface UseIntersectionFetchNextPageResult {
  setSentinelRef: (node: HTMLDivElement | null) => void;
  isNearEnd: boolean;
}

function isSentinelIntersecting(
  sentinel: HTMLElement,
  root: HTMLElement | null,
  marginPx: number
): boolean {
  const sentinelRect = sentinel.getBoundingClientRect();
  if (sentinelRect.width === 0 && sentinelRect.height === 0) return false;

  const rootRect = root
    ? root.getBoundingClientRect()
    : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };

  return (
    sentinelRect.top <= rootRect.bottom + marginPx &&
    sentinelRect.bottom >= rootRect.top - marginPx
  );
}

/**
 * Triggers fetchNextPage when a sentinel enters the scroll container viewport.
 * Intended for React Query useInfiniteQuery pagination inside nested scroll areas.
 */
export function useIntersectionFetchNextPage({
  scrollRootRef,
  enabled,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = '200px 0px 200px 0px',
}: UseIntersectionFetchNextPageOptions): UseIntersectionFetchNextPageResult {
  const sentinelNodeRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingRef = useRef(isFetchingNextPage);
  const fetchNextPageRef = useRef(fetchNextPage);
  const enabledRef = useRef(enabled);
  const [isNearEnd, setIsNearEnd] = useState(false);
  const marginMatch = rootMargin.match(/^(\d+)px/);
  const marginPx = marginMatch ? Number(marginMatch[1]) : 200;

  hasNextPageRef.current = hasNextPage;
  isFetchingRef.current = isFetchingNextPage;
  fetchNextPageRef.current = fetchNextPage;
  enabledRef.current = enabled;

  const disconnectObserver = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const tryFetch = useCallback(() => {
    if (!enabledRef.current || !hasNextPageRef.current) return;
    if (loadingRef.current || isFetchingRef.current) return;
    const inCooldown = Date.now() - lastFetchAtRef.current < COOLDOWN_MS;
    if (inCooldown) return;

    loadingRef.current = true;
    lastFetchAtRef.current = Date.now();

    try {
      const result = fetchNextPageRef.current();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>).finally(() => {
          loadingRef.current = false;
        });
      } else {
        loadingRef.current = false;
      }
    } catch {
      loadingRef.current = false;
    }
  }, []);

  const maybeFetchIfSentinelVisible = useCallback(() => {
    const sentinel = sentinelNodeRef.current;
    const root = scrollRootRef.current;
    if (!sentinel || !enabledRef.current || !hasNextPageRef.current) return;
    if (!isSentinelIntersecting(sentinel, root, marginPx)) return;
    tryFetch();
  }, [scrollRootRef, marginPx, tryFetch]);

  const bindObserver = useCallback(
    (sentinel: HTMLDivElement) => {
      disconnectObserver();
      const root = scrollRootRef.current;
      const observer = new IntersectionObserver(
        (entries) => {
          const intersecting = entries[0]?.isIntersecting ?? false;
          setIsNearEnd(intersecting);
          if (intersecting) {
            tryFetch();
          }
        },
        {
          root: root ?? null,
          rootMargin,
        }
      );
      observer.observe(sentinel);
      observerRef.current = observer;
    },
    [scrollRootRef, rootMargin, tryFetch, disconnectObserver]
  );

  const setSentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      sentinelNodeRef.current = node;
      disconnectObserver();
      if (!node || !enabledRef.current || !hasNextPageRef.current) {
        setIsNearEnd(false);
        return;
      }
      bindObserver(node);
    },
    [bindObserver, disconnectObserver]
  );

  // Re-bind when scroll root, enabled, or hasNextPage changes while sentinel is mounted.
  useEffect(() => {
    const sentinel = sentinelNodeRef.current;
    if (!sentinel || !enabled || !hasNextPage) {
      if (!enabled || !hasNextPage) {
        disconnectObserver();
        setIsNearEnd(false);
      }
      return;
    }
    bindObserver(sentinel);
    return () => {
      disconnectObserver();
    };
  }, [enabled, hasNextPage, scrollRootRef, rootMargin, bindObserver, disconnectObserver]);

  const prevFetchingRef = useRef(isFetchingNextPage);
  useEffect(() => {
    const wasFetching = prevFetchingRef.current;
    prevFetchingRef.current = isFetchingNextPage;
    if (wasFetching && !isFetchingNextPage) {
      loadingRef.current = false;
      requestAnimationFrame(() => {
        maybeFetchIfSentinelVisible();
      });
    }
  }, [isFetchingNextPage, maybeFetchIfSentinelVisible]);

  useEffect(() => {
    return () => {
      disconnectObserver();
    };
  }, [disconnectObserver]);

  return {
    setSentinelRef,
    isNearEnd,
  };
}
