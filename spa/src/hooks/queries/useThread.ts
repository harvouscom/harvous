import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface NoteItem {
  id: string;
  title: string | null;
  content: string | null;
  type: string;
  createdAt: string;
  updatedAt: string;
  threadId: string;
  backgroundGradient?: string;
  tags?: string[];
}

export interface ThreadDetail {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string;
  noteCount: number;
  spaceId: string | null;
  isPublic: boolean;
  userId?: string;
}

/** From GET /api/threads/:id/prefetch — drives per-tab totals / infinite scroll for filtered note lists. */
export interface ThreadNoteTypeCounts {
  all: number;
  default: number;
  scripture: number;
  resource: number;
}

export interface ThreadPrefetchData {
  thread: ThreadDetail;
  noteTypeCounts?: ThreadNoteTypeCounts;
}

/**
 * React Query may still hold a legacy cache entry where `data` was the thread object itself
 * (before prefetch returned `{ thread, noteTypeCounts }`). Normalize so consumers always get
 * ThreadPrefetchData — otherwise `data.thread` is undefined and nav/history break.
 */
function normalizeThreadPrefetchData(raw: ThreadPrefetchData | ThreadDetail): ThreadPrefetchData {
  if (raw && typeof raw === 'object' && 'thread' in raw && (raw as ThreadPrefetchData).thread) {
    return raw as ThreadPrefetchData;
  }
  return { thread: raw as ThreadDetail, noteTypeCounts: undefined };
}

interface NotesPage {
  notes: NoteItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

function normalizeThreadId(id: string): string {
  return id.startsWith('thread/') ? 'thread_' + id.slice(7) : id;
}

const THREAD_PREFETCH_CACHE_PREFIX = 'harvous-thread-prefetch-';
const THREAD_PREFETCH_CACHE_INDEX = 'harvous-thread-prefetch-index';
const MAX_CACHED_THREAD_PREFETCH = 15;

function getCachedThreadPrefetch(threadId: string): ThreadPrefetchData | undefined {
  if (!threadId) return undefined;
  try {
    const raw = sessionStorage.getItem(`${THREAD_PREFETCH_CACHE_PREFIX}${threadId}`);
    if (!raw) return undefined;
    return normalizeThreadPrefetchData(JSON.parse(raw) as ThreadPrefetchData | ThreadDetail);
  } catch {
    return undefined;
  }
}

function setCachedThreadPrefetch(threadId: string, data: ThreadPrefetchData) {
  try {
    sessionStorage.setItem(`${THREAD_PREFETCH_CACHE_PREFIX}${threadId}`, JSON.stringify(data));
    let index: string[] = [];
    try {
      const raw = sessionStorage.getItem(THREAD_PREFETCH_CACHE_INDEX);
      index = raw ? JSON.parse(raw) : [];
    } catch {
      index = [];
    }
    index = [threadId, ...index.filter((id) => id !== threadId)];
    while (index.length > MAX_CACHED_THREAD_PREFETCH) {
      const evicted = index.pop()!;
      sessionStorage.removeItem(`${THREAD_PREFETCH_CACHE_PREFIX}${evicted}`);
    }
    sessionStorage.setItem(THREAD_PREFETCH_CACHE_INDEX, JSON.stringify(index));
  } catch {
    /* quota or private browsing */
  }
}

/** Keep low so thread title/color edits (e.g. admin patches) show without long stale UI. */
const THREAD_STALE_TIME = 0;

export function getThreadQueryOptions(threadId: string) {
  const normalizedId = normalizeThreadId(threadId);
  return {
    queryKey: ['thread', normalizedId] as const,
    queryFn: async (): Promise<ThreadPrefetchData> => {
      const res = await api.get<{
        thread: ThreadDetail;
        noteTypeCounts?: ThreadNoteTypeCounts;
      }>(`/api/threads/${normalizedId}/prefetch`);
      if (res.thread === undefined) throw new Error('Thread not found');
      const data: ThreadPrefetchData = { thread: res.thread, noteTypeCounts: res.noteTypeCounts };
      setCachedThreadPrefetch(normalizedId, data);
      return data;
    },
    staleTime: THREAD_STALE_TIME,
  };
}

export function useThread(threadId: string) {
  const options = getThreadQueryOptions(threadId);
  const normalizedId = normalizeThreadId(threadId);
  const cached = threadId ? getCachedThreadPrefetch(normalizedId) : undefined;
  return useQuery({
    ...options,
    enabled: !!threadId,
    select: (data) => normalizeThreadPrefetchData(data as ThreadPrefetchData | ThreadDetail),
    initialData: cached,
    initialDataUpdatedAt: cached ? Date.now() - 5_000 : undefined,
  });
}

export function useThreadNotes(threadId: string, limit = 20) {
  const normalizedId = normalizeThreadId(threadId);
  return useInfiniteQuery({
    queryKey: ['thread', normalizedId, 'notes'],
    queryFn: ({ pageParam = 0 }) =>
      api.get<NotesPage>(`/api/threads/${normalizedId}/notes`, { offset: pageParam, limit }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    enabled: !!normalizedId,
    staleTime: 30_000,
  });
}
