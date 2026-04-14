import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizeDate } from '../../../../src/utils/sorting';

const bootstrapQueryKey = (spaceId: string) => ['space', spaceId, 'bootstrap'] as const;

const SPACE_BOOTSTRAP_CACHE_PREFIX = 'harvous-space-bootstrap-';
const SPACE_BOOTSTRAP_CACHE_INDEX = 'harvous-space-bootstrap-index';
const MAX_CACHED_SPACES = 5;

export type SpaceBootstrapData = { space: SpaceDetail; items: SpaceContentItem[] };

/** SessionStorage bootstrap snapshot for SpacePage shell while React Query refetches. */
export function getCachedSpaceBootstrap(spaceId: string): SpaceBootstrapData | undefined {
  try {
    const raw = sessionStorage.getItem(`${SPACE_BOOTSTRAP_CACHE_PREFIX}${spaceId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function setCachedSpaceBootstrap(spaceId: string, data: SpaceBootstrapData) {
  try {
    sessionStorage.setItem(`${SPACE_BOOTSTRAP_CACHE_PREFIX}${spaceId}`, JSON.stringify(data));
    let index: string[] = [];
    try {
      const raw = sessionStorage.getItem(SPACE_BOOTSTRAP_CACHE_INDEX);
      index = raw ? JSON.parse(raw) : [];
    } catch {
      index = [];
    }
    index = [spaceId, ...index.filter((id) => id !== spaceId)];
    while (index.length > MAX_CACHED_SPACES) {
      const evicted = index.pop()!;
      sessionStorage.removeItem(`${SPACE_BOOTSTRAP_CACHE_PREFIX}${evicted}`);
    }
    sessionStorage.setItem(SPACE_BOOTSTRAP_CACHE_INDEX, JSON.stringify(index));
  } catch {
    /* quota or private browsing */
  }
}

export function clearCachedSpaceBootstrap(spaceId: string): void {
  try {
    sessionStorage.removeItem(`${SPACE_BOOTSTRAP_CACHE_PREFIX}${spaceId}`);
    const raw = sessionStorage.getItem(SPACE_BOOTSTRAP_CACHE_INDEX);
    if (raw) {
      const index: string[] = JSON.parse(raw).filter((id: string) => id !== spaceId);
      sessionStorage.setItem(SPACE_BOOTSTRAP_CACHE_INDEX, JSON.stringify(index));
    }
  } catch {
    /* quota or private browsing */
  }
}

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
  backgroundGradient?: string;
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      const bootstrap = queryClient.getQueryData<{ space: SpaceDetail; items: SpaceContentItem[] }>(bootstrapQueryKey(spaceId));
      if (bootstrap?.space) return bootstrap.space;
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
    staleTime: 30_000,
  });
}

interface SpaceItemsResponse {
  threads: Array<{
    id: string;
    title?: string;
    subtitle?: string;
    noteCount?: number;
    accentColor?: string;
    backgroundGradient?: string;
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
      backgroundGradient: thread.backgroundGradient,
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

/** For prefetch on hover (dashboard, nav) — matches `useSpaceBootstrap`. */
export function getSpaceBootstrapQueryOptions(spaceId: string) {
  const id = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
  return {
    queryKey: bootstrapQueryKey(id),
    queryFn: async (): Promise<SpaceBootstrapData> => {
      const data = await api.get<{ space: SpaceDetail; items: SpaceItemsResponse }>(`/api/spaces/${id}/bootstrap`);
      const space = data.space;
      const items = mapSpaceItemsResponse(data.items);
      if (!space) throw new Error('Space not found');
      const payload: SpaceBootstrapData = { space, items };
      setCachedSpaceBootstrap(id, payload);
      return payload;
    },
    staleTime: 30_000,
  };
}

export function useSpaceItems(spaceId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['space', spaceId, 'items'],
    queryFn: async () => {
      const bootstrap = queryClient.getQueryData<{ space: SpaceDetail; items: SpaceContentItem[] }>(bootstrapQueryKey(spaceId));
      if (bootstrap?.items) return bootstrap.items;
      const data = await api.get<SpaceItemsResponse>(`/api/spaces/${spaceId}/items`);
      return mapSpaceItemsResponse(data);
    },
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

/** Single request for space + items; use on SpacePage for one round-trip. Populates cache for useSpace/useSpaceItems. */
export function useSpaceBootstrap(spaceId: string) {
  const cachedBootstrap = spaceId ? getCachedSpaceBootstrap(spaceId) : undefined;
  const opts = getSpaceBootstrapQueryOptions(spaceId);
  return useQuery({
    ...opts,
    enabled: !!spaceId,
    initialData: cachedBootstrap,
    initialDataUpdatedAt: cachedBootstrap ? Date.now() - 15_000 : undefined,
  });
}
