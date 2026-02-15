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
}

interface NotesPage {
  notes: NoteItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export function useThread(threadId: string) {
  return useQuery({
    queryKey: ['thread', threadId],
    // Prefetch endpoint returns { thread: ThreadDetail, notes, noteTypeCounts }
    queryFn: () =>
      api.get<{ thread: ThreadDetail }>(`/api/threads/${threadId}/prefetch`)
        .then(res => res.thread),
    enabled: !!threadId,
  });
}

export function useThreadNotes(threadId: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: ['thread', threadId, 'notes'],
    queryFn: ({ pageParam = 0 }) =>
      api.get<NotesPage>(`/api/threads/${threadId}/notes`, { offset: pageParam, limit }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    enabled: !!threadId,
    staleTime: 30_000,
  });
}

export function useThreadNoteTypeCounts(threadId: string) {
  return useQuery({
    queryKey: ['thread', threadId, 'noteTypeCounts'],
    queryFn: () =>
      api.get<{ default: number; scripture: number; resource: number }>(
        `/api/threads/${threadId}/note-type-counts`
      ),
    enabled: !!threadId,
  });
}
