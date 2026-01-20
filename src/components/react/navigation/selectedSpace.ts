import { useEffect, useState } from 'react';
import { safeGetItem, safeSetItem } from '@/utils/safe-storage';

const STORAGE_KEY = 'harvous-selected-space-id';
const EVENT_NAME = 'harvousSelectedSpaceUpdated';

function normalizeSpaceId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'home') return null;
  // Normalize accidental leading/trailing slashes (e.g. "space_123/" or "/space_123").
  const withoutLeading = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith('/') ? withoutLeading.slice(0, -1) : withoutLeading;
  return withoutTrailing || null;
}

export function getSelectedSpaceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    // safeGetItem reads from the “best available” storage (localStorage or sessionStorage).
    // If writes were forced to sessionStorage but localStorage later becomes available,
    // we still want to be able to read the stored selection.
    const fromSafe = normalizeSpaceId(safeGetItem(STORAGE_KEY));
    if (fromSafe) return fromSafe;
    const fromLocal = normalizeSpaceId(window.localStorage.getItem(STORAGE_KEY));
    if (fromLocal) return fromLocal;
    const fromSession = normalizeSpaceId(window.sessionStorage.getItem(STORAGE_KEY));
    return fromSession;
  } catch {
    return null;
  }
}

export function setSelectedSpaceId(spaceId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeSpaceId(spaceId);
    if (!normalized) {
      safeSetItem(STORAGE_KEY, 'home', { cleanupOldest: true, fallbackToSession: true });
    } else {
      safeSetItem(STORAGE_KEY, normalized, { cleanupOldest: true, fallbackToSession: true });
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { spaceId: normalized } }));
  } catch {
    // ignore storage failures (e.g., private mode)
  }
}

/**
 * SSR-safe hook for the currently selected space.
 *
 * Important: To avoid React hydration mismatches, this hook does NOT read from storage
 * during initial render by default. Instead, it uses the provided `initialSpaceId`
 * (typically derived from route/query params) for the first render on both server and client,
 * then syncs from storage after mount.
 */
export function useSelectedSpaceId(initialSpaceId: string | null = null): string | null {
  const [selectedSpaceId, setSelectedSpaceIdState] = useState<string | null>(() => normalizeSpaceId(initialSpaceId));

  useEffect(() => {
    // After mount, hydrate from storage (this is safe and won't cause hydration mismatch).
    setSelectedSpaceIdState(getSelectedSpaceId());

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setSelectedSpaceIdState(normalizeSpaceId(event.newValue));
    };

    const handleCustom = (event: Event) => {
      const customEvent = event as CustomEvent;
      const fromDetail = normalizeSpaceId(customEvent?.detail?.spaceId ?? null);
      setSelectedSpaceIdState(fromDetail ?? getSelectedSpaceId());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_NAME, handleCustom as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_NAME, handleCustom as EventListener);
    };
  }, []);

  return selectedSpaceId;
}

