import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizeDate } from '../../../../src/utils/sorting';

export interface SpaceDetail {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string;
  ownerId: string;
  memberCount: number;
  isPublic: boolean;
}

export interface SpaceItem {
  id: string;
  type: 'note' | 'thread';
  title: string | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape used by SpaceContentList (threads + notes combined, itemType, lastUpdated, etc.) */
export interface SpaceContentItem {
  id: string;
  itemType: 'thread' | 'note';
  title: string;
  subtitle?: string;
  noteCount?: number;
  accentColor?: string;
  lastUpdated?: string;
  isPublic?: boolean;
  noteType?: 'default' | 'scripture' | 'resource';
  content?: string;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  threadColors?: Array<{ color: string; frequency: number }>;
  createdAt?: Date | string;
  lastVisited?: Date | string;
  contentEncrypted?: boolean;
  threadId?: string | null;
  userId?: string;
}

interface SpaceItemsPage {
  items: SpaceItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export function useSpace(spaceId: string) {
  return useQuery({
    queryKey: ['space', spaceId],
    // Prefetch endpoint returns { space: SpaceDetail }
    queryFn: async () => {
      const res = await api.get<{ space: SpaceDetail }>(`/api/spaces/${spaceId}/prefetch`);
      if (res.space === undefined) throw new Error('Space not found');
      return res.space;
    },
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useSpaceNotes(spaceId: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: ['space', spaceId, 'notes'],
    queryFn: ({ pageParam = 0 }) =>
      api.get<SpaceItemsPage>(`/api/spaces/${spaceId}/notes`, { offset: pageParam, limit }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useSpaceMembers(spaceId: string) {
  return useQuery({
    queryKey: ['space', spaceId, 'members'],
    queryFn: () => api.get<{ members: unknown[] }>(`/api/spaces/${spaceId}/members`),
    enabled: !!spaceId,
  });
}

interface SpaceItemsResponse {
  threads: Array<{
    id: string;
    title?: string;
    subtitle?: string;
    noteCount?: number;
    accentColor?: string;
    lastUpdated?: string;
    isPublic?: boolean;
    createdAt?: string;
    lastVisited?: string;
    userId?: string;
  }>;
  notes: Array<{
    id: string;
    title?: string;
    noteType?: string;
    content?: string;
    contentEncrypted?: boolean;
    resourceTitle?: string | null;
    resourceDescription?: string | null;
    resourceImage?: string | null;
    threadColors?: Array<{ color: string; frequency: number }>;
    createdAt?: string;
    lastVisited?: string;
    userId?: string;
  }>;
}

function mapSpaceItemsResponse(data: SpaceItemsResponse): SpaceContentItem[] {
  const { threads = [], notes = [] } = data;
  const allItems: SpaceContentItem[] = [
    ...threads.map((thread) => ({
      id: thread.id,
      itemType: 'thread' as const,
      title: thread.title ?? '',
      subtitle: thread.subtitle || `${thread.noteCount ?? 0} notes`,
      noteCount: thread.noteCount,
      accentColor: thread.accentColor,
      lastUpdated: thread.lastUpdated,
      isPublic: thread.isPublic,
      createdAt: normalizeDate(thread.createdAt) || thread.createdAt,
      lastVisited: normalizeDate(thread.lastVisited) || thread.lastVisited,
      userId: thread.userId,
    })),
    ...notes.map((note) => ({
      id: note.id,
      itemType: 'note' as const,
      title: note.title || 'Untitled Note',
      noteType: (note.noteType as 'default' | 'scripture' | 'resource') || 'default',
      content: note.content,
      contentEncrypted: note.contentEncrypted === true,
      resourceTitle: note.resourceTitle,
      resourceDescription: note.resourceDescription,
      resourceImage: note.resourceImage,
      threadColors: note.threadColors,
      createdAt: normalizeDate(note.createdAt) || note.createdAt,
      lastVisited: normalizeDate(note.lastVisited) || note.lastVisited,
      userId: note.userId,
    })),
  ];
  return allItems;
}

export function useSpaceItems(spaceId: string) {
  return useQuery({
    queryKey: ['space', spaceId, 'items'],
    queryFn: async () => {
      const data = await api.get<SpaceItemsResponse>(`/api/spaces/${spaceId}/items`);
      return mapSpaceItemsResponse(data);
    },
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}
