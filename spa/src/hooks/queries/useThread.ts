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

interface NotesPage {
  notes: NoteItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

function normalizeThreadId(id: string): string {
  return id.startsWith('thread/') ? 'thread_' + id.slice(7) : id;
}

const THREAD_STALE_TIME = 60_000;

export function getThreadQueryOptions(threadId: string) {
  const normalizedId = normalizeThreadId(threadId);
  return {
    queryKey: ['thread', normalizedId] as const,
    queryFn: async (): Promise<ThreadDetail> => {
      const res = await api.get<{ thread: ThreadDetail }>(`/api/threads/${normalizedId}/prefetch`);
      if (res.thread === undefined) throw new Error('Thread not found');
      return res.thread;
    },
    staleTime: THREAD_STALE_TIME,
  };
}

export function useThread(threadId: string) {
  const options = getThreadQueryOptions(threadId);
  return useQuery({
    ...options,
    enabled: !!threadId,
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

export function useThreadNoteTypeCounts(threadId: string) {
  const normalizedId = normalizeThreadId(threadId);
  return useQuery({
    queryKey: ['thread', normalizedId, 'noteTypeCounts'],
    queryFn: () =>
      api.get<{ default: number; scripture: number; resource: number }>(
        `/api/threads/${normalizedId}/note-type-counts`
      ),
    enabled: !!normalizedId,
    staleTime: 30_000,
  });
}
