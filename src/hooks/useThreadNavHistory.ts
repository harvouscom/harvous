import { useCallback, useEffect, useMemo, useState } from 'react';
import { idToUrl } from '@/utils/url-helpers';

export type ThreadNavEntryType = 'thread' | 'note';

export interface ThreadNavEntry {
  id: string;
  type: ThreadNavEntryType;
  path: string;
}

interface StoredThreadHistory {
  entries: ThreadNavEntry[];
  currentIndex: number;
  updatedAt: number;
}

type StoredThreadHistoryMap = Record<string, StoredThreadHistory>;

interface UseThreadNavHistoryOptions {
  enabled?: boolean;
  pathname: string;
  search?: string;
  isThreadRoute: boolean;
  isNoteRoute: boolean;
  threadId: string | null;
  noteId: string | null;
  onNavigate: (href: string) => void;
}

interface ThreadNavPushDetail {
  threadId?: string;
  entry?: ThreadNavEntry;
}

const STORAGE_KEY = 'harvous-thread-nav-history-v1';
const STALE_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 15;

function toSearchString(search?: string): string {
  if (!search) return '';
  return search.startsWith('?') ? search : `?${search}`;
}

function readStore(): StoredThreadHistoryMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const next: StoredThreadHistoryMap = {};
    for (const [threadId, value] of Object.entries(parsed as Record<string, any>)) {
      if (!threadId.startsWith('thread_')) continue;
      if (!value || typeof value !== 'object') continue;
      if (typeof value.updatedAt !== 'number' || now - value.updatedAt > STALE_MS) continue;
      const entries = Array.isArray(value.entries)
        ? value.entries.filter(
            (entry: any) =>
              entry &&
              typeof entry.id === 'string' &&
              (entry.type === 'thread' || entry.type === 'note') &&
              typeof entry.path === 'string'
          )
        : [];
      if (!entries.length) continue;
      const maxIndex = entries.length - 1;
      const currentIndexRaw = typeof value.currentIndex === 'number' ? value.currentIndex : maxIndex;
      const currentIndex = Math.max(0, Math.min(maxIndex, currentIndexRaw));
      next[threadId] = {
        entries,
        currentIndex,
        updatedAt: value.updatedAt
      };
    }
    return next;
  } catch {
    return {};
  }
}

function writeStore(store: StoredThreadHistoryMap): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore write failures
  }
}

function normalizeThreadId(id: string | null): string | null {
  if (!id) return null;
  if (id.startsWith('thread_')) return id;
  return `thread_${id}`;
}

function normalizeNoteId(id: string | null): string | null {
  if (!id) return null;
  if (id.startsWith('note_')) return id;
  return `note_${id}`;
}

function upsertEntry(
  history: StoredThreadHistory,
  incoming: ThreadNavEntry
): StoredThreadHistory {
  const existingIndex = history.entries.findIndex((entry) => entry.path === incoming.path);
  if (existingIndex >= 0) {
    return {
      ...history,
      currentIndex: existingIndex,
      updatedAt: Date.now()
    };
  }

  const nextEntries = history.entries.slice(0, history.currentIndex + 1);
  nextEntries.push(incoming);
  const trimmed = nextEntries.slice(-MAX_ENTRIES);
  return {
    entries: trimmed,
    currentIndex: trimmed.length - 1,
    updatedAt: Date.now()
  };
}

export function useThreadNavHistory({
  enabled = true,
  pathname,
  search,
  isThreadRoute,
  isNoteRoute,
  threadId,
  noteId,
  onNavigate
}: UseThreadNavHistoryOptions) {
  const [store, setStore] = useState<StoredThreadHistoryMap>(() => readStore());

  const activeThreadId = useMemo(() => normalizeThreadId(threadId), [threadId]);
  const activeNoteId = useMemo(() => normalizeNoteId(noteId), [noteId]);

  const activeEntry = useMemo<ThreadNavEntry | null>(() => {
    if (!enabled || !activeThreadId) return null;
    const currentPath = `${pathname}${toSearchString(search)}`;
    if (isThreadRoute) {
      return { id: activeThreadId, type: 'thread', path: currentPath };
    }
    if (isNoteRoute && activeNoteId) {
      return { id: activeNoteId, type: 'note', path: currentPath };
    }
    return null;
  }, [enabled, activeNoteId, activeThreadId, isNoteRoute, isThreadRoute, pathname, search]);

  useEffect(() => {
    if (!activeEntry || !activeThreadId) return;
    setStore((prev) => {
      const existing = prev[activeThreadId] ?? {
        entries: [],
        currentIndex: -1,
        updatedAt: Date.now()
      };
      const baseHistory =
        existing.entries.length === 0 && activeEntry.type === 'note'
          ? {
              entries: [{ id: activeThreadId, type: 'thread', path: idToUrl(activeThreadId) }],
              currentIndex: 0,
              updatedAt: Date.now()
            }
          : existing;
      const nextHistory = upsertEntry(baseHistory, activeEntry);
      const nextStore = { ...prev, [activeThreadId]: nextHistory };
      writeStore(nextStore);
      return nextStore;
    });
  }, [activeEntry, activeThreadId]);

  useEffect(() => {
    const onPush = (event: Event) => {
      if (!enabled) return;
      const detail = (event as CustomEvent<ThreadNavPushDetail>).detail;
      const pushedThreadId = normalizeThreadId(detail?.threadId ?? null);
      const pushedEntry = detail?.entry;
      if (!pushedThreadId || !pushedEntry) return;
      const normalizedEntry: ThreadNavEntry = {
        id: pushedEntry.type === 'thread' ? normalizeThreadId(pushedEntry.id) ?? pushedEntry.id : normalizeNoteId(pushedEntry.id) ?? pushedEntry.id,
        type: pushedEntry.type,
        path: pushedEntry.path
      };
      setStore((prev) => {
        const existing = prev[pushedThreadId] ?? {
          entries: [{ id: pushedThreadId, type: 'thread', path: idToUrl(pushedThreadId) }],
          currentIndex: 0,
          updatedAt: Date.now()
        };
        const nextHistory = upsertEntry(existing, normalizedEntry);
        const nextStore = { ...prev, [pushedThreadId]: nextHistory };
        writeStore(nextStore);
        return nextStore;
      });
    };

    window.addEventListener('threadNavHistoryPush', onPush as EventListener);
    return () => window.removeEventListener('threadNavHistoryPush', onPush as EventListener);
  }, [enabled]);

  const activeHistory = activeThreadId ? store[activeThreadId] : undefined;
  const entries = activeHistory?.entries ?? [];
  const currentIndex = activeHistory?.currentIndex ?? 0;
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex >= 0 && currentIndex < entries.length - 1;

  const goTo = useCallback(
    (index: number) => {
      if (!activeThreadId) return;
      const history = store[activeThreadId];
      if (!history) return;
      if (index < 0 || index >= history.entries.length) return;
      const target = history.entries[index];
      setStore((prev) => {
        const nextHistory = {
          ...history,
          currentIndex: index,
          updatedAt: Date.now()
        };
        const nextStore = { ...prev, [activeThreadId]: nextHistory };
        writeStore(nextStore);
        return nextStore;
      });
      onNavigate(target.path);
    },
    [activeThreadId, onNavigate, store]
  );

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    goTo(currentIndex - 1);
  }, [canGoBack, currentIndex, goTo]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    goTo(currentIndex + 1);
  }, [canGoForward, currentIndex, goTo]);

  return {
    entries,
    currentIndex,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goTo
  };
}
