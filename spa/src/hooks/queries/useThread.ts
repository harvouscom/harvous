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
      return { thread: res.thread, noteTypeCounts: res.noteTypeCounts };
    },
    staleTime: THREAD_STALE_TIME,
  };
}

export function useThread(threadId: string) {
  const options = getThreadQueryOptions(threadId);
  return useQuery({
    ...options,
    enabled: !!threadId,
    select: (data) => normalizeThreadPrefetchData(data as ThreadPrefetchData | ThreadDetail),
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
