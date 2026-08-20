import { useQuery, useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { isSupabaseRealtimeConfigured } from '@/lib/supabase-client';
import { getSharedSpaceUnseenSince } from '../useSharedSpaceVisit';
import { useAuthReady } from '../useAuthReady';
import { api, APIError } from '../../lib/api';
import { hasClerkSessionCookieHint } from './useProfile';
import { normalizeDate } from '../../../../src/utils/sorting';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';

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

/** Drops all sessionStorage space bootstrap + notes list snapshots. */
export function clearAllSessionSpaceCaches(): void {
  try {
    const raw = sessionStorage.getItem(SPACE_BOOTSTRAP_CACHE_INDEX);
    if (raw) {
      const index: string[] = JSON.parse(raw);
      for (const spaceId of index) {
        sessionStorage.removeItem(`${SPACE_BOOTSTRAP_CACHE_PREFIX}${spaceId}`);
        sessionStorage.removeItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${spaceId}`);
      }
    }
    sessionStorage.removeItem(SPACE_BOOTSTRAP_CACHE_INDEX);
  } catch {
    /* quota or private browsing */
  }
}

export interface SpaceDetail {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string;
  description?: string | null;
  coverBgLight?: import('@/utils/space-cover').SpaceCoverBg;
  coverBgDark?: import('@/utils/space-cover').SpaceCoverBg;
  ownerId: string;
  memberCount: number;
  isPublic: boolean;
  type?: 'personal' | 'shared' | 'public';
  orgId?: string | null;
  isOwner?: boolean;
  /** Ministry channels: staff-declared publish cadence. */
  publishCadence?: import('@/utils/channel-publish-cadence').PublishCadence | null;
  lastCurriculumAt?: string | null;
  cadenceStale?: boolean;
  /** 0–6, Sunday first — when the room gathers. Null until somebody says. */
  meetingDay?: number | null;
  /** 'HH:MM' wall clock, no zone. */
  meetingTime?: string | null;
  /** 'in_person' | 'online' | 'hybrid' — where the room meets. */
  meetingKind?: import('@/utils/space-meeting-rhythm').MeetingKind | null;
  /** The room's standing video link. Members only — never on a join page. */
  meetingUrl?: string | null;
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
  isPinned?: boolean;
}

export interface SpaceNoteRow {
  id: string;
  title?: string | null;
  /** Truncated to NOTE_LIST_CONTENT_MAX_CHARS server-side — never write this back to a note. */
  content?: string | null;
  /** Length of the stored body; greater than `content.length` means `content` is a prefix. */
  contentLength?: number | null;
  noteType?: string;
  isPinned?: boolean;
  simpleNoteId?: number | null;
  createdAt?: string;
  updatedAt?: string | null;
  lastVisited?: string | null;
  lastUpdated?: string;
  resourceTitle?: string | null;
  contentEncrypted?: boolean;
  primaryCollection?: string | null;
  secondaryCollections?: string[];
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
  /** Viewer's own tag names, capped server-side — powers offline/local search only. */
  tags?: string[];
  version?: string;
  /** Present on shared/public space merged-author queries only. */
  authorUserId?: string;
  authorDisplayName?: string;
  authorColor?: string;
  isOwnNote?: boolean;
  /** Shared space list: note updated after the member's prior visit watermark. */
  isNewSinceVisit?: boolean;
  /**
   * How many live shared spaces / channels this note is published to. Sent only for
   * the My Home aggregate — inside a shared space every row is in that space, so a
   * badge there would be noise. Absent/0 means private.
   */
  sharedSpaceCount?: number;
}

/** Paginated notes-only list from `GET /api/spaces/:spaceId/notes` */
interface SpaceNotesPage {
  notes: SpaceNoteRow[];
  hasMore: boolean;
  /** True space note count (first page only on this endpoint). Absent on member/cache-miss paths. */
  total?: number;
  offset: number;
  limit: number;
}

/**
 * SessionStorage snapshot of a space's first notes page so the sidebar list paints
 * instantly on refresh (then revalidates) instead of flashing "Loading notes…".
 * First page only — keeps storage bounded; the list API truncates note content.
 * Cleared on sign-out by prefix in `clear-user-client-caches.ts`.
 */
function getCachedSpaceNotesFirstPage(id: string): SpaceNotesPage | undefined {
  try {
    const raw = sessionStorage.getItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as SpaceNotesPage) : undefined;
  } catch {
    return undefined;
  }
}

function setCachedSpaceNotesFirstPage(id: string, page: SpaceNotesPage) {
  try {
    sessionStorage.setItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${id}`, JSON.stringify(page));
  } catch {
    /* quota or private browsing */
  }
}

export function useSpace(spaceId: string) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      // Always hit the network so cover/color updates aren't stuck on a stale
      // bootstrap snapshot (About hero, settings, etc.).
      const res = await api.get<{ space: SpaceDetail }>(`/api/spaces/${spaceId}/prefetch`);
      if (res.space === undefined) throw new Error('Space not found');
      const bootstrap = queryClient.getQueryData<SpaceBootstrapData>(bootstrapQueryKey(spaceId));
      if (bootstrap) {
        queryClient.setQueryData(bootstrapQueryKey(spaceId), {
          ...bootstrap,
          space: res.space,
        });
      }
      return res.space;
    },
    placeholderData: () => {
      const bootstrap = queryClient.getQueryData<SpaceBootstrapData>(bootstrapQueryKey(spaceId));
      return bootstrap?.space;
    },
    // Cold-start race: firing before the Clerk session JWT is attachable 401s and
    // then never auto-retries (see useAuthReady's docstring; useSpaceNotes below
    // hit this same bug first).
    enabled: authReady && !!spaceId,
    staleTime: 30_000,
  });
}

export function useSpaceNotes(
  spaceId: string,
  limit = 20,
  options?: { pollWhileActive?: boolean; unseenSince?: string | null },
) {
  const authReady = useAuthReady();
  const trimmed = (spaceId ?? '').trim();
  const id = trimmed.startsWith('space_') ? trimmed : trimmed ? `space_${trimmed}` : '';
  const unseenSince = options?.unseenSince ?? (id ? getSharedSpaceUnseenSince(id) : null);
  const usePollFallback =
    Boolean(options?.pollWhileActive) && !isSupabaseRealtimeConfigured();
  const cachedFirstPage = id ? getCachedSpaceNotesFirstPage(id) : undefined;
  // Hydrate instantly from the cached first page; `initialDataUpdatedAt: 0` marks it
  // stale so React Query revalidates in the background on mount (instant + fresh).
  const initialData: InfiniteData<SpaceNotesPage, number> | undefined = cachedFirstPage
    ? { pages: [cachedFirstPage], pageParams: [0] }
    : undefined;
  const query = useInfiniteQuery({
    queryKey: ['space', id, 'notes', 'no-legacy-scripture', 'updated', unseenSince ?? ''],
    queryFn: async ({ pageParam = 0 }) => {
      const page = await api.get<SpaceNotesPage>(`/api/spaces/${id}/notes`, {
        offset: pageParam,
        limit,
        excludeLegacyScripture: 1,
        sortBy: 'updated',
        ...(unseenSince ? { unseenSince } : {}),
      });
      if (pageParam === 0 && id) setCachedSpaceNotesFirstPage(id, page);
      return page;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    enabled: authReady && !!id,
    staleTime: 30_000,
    refetchInterval: usePollFallback ? 45_000 : undefined,
    refetchIntervalInBackground: false,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status === 401) {
        return hasClerkSessionCookieHint() && failureCount < 2;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
  });

  const prevAuthReadyRef = useRef(authReady);
  useEffect(() => {
    const wasReady = prevAuthReadyRef.current;
    prevAuthReadyRef.current = authReady;
    if (!wasReady && authReady && id) {
      void query.refetch();
    }
  }, [authReady, id, query.refetch]);

  return query;
}

export interface SpaceMemberRow {
  userId: string;
  role: 'owner' | 'leader' | 'member';
  /**
   * `'grant'` when a church admin or the space owner handed this person
   * leadership of this one room. Anything else — including null — is the staff
   * sync's projection, which the people sheet must not offer to revoke.
   */
  grantSource?: string | null;
  joinedAt: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  profileImageUrl: string | null;
  userColor: string;
}

export interface SpaceMembersResponse {
  members: SpaceMemberRow[];
  memberCount: number;
  isOwner: boolean;
  limits?: { membersPerSpace: number; ownedSharedSpaces: number };
}

export function useSpaceMembers(spaceId: string) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['space', spaceId, 'members'],
    queryFn: () => api.get<SpaceMembersResponse>(`/api/spaces/${spaceId}/members`),
    enabled: authReady && !!spaceId,
    staleTime: 30_000,
  });
}

export interface SpaceInviteRow {
  id: string;
  inviteUrl: string;
  kind: 'link' | 'email';
  role: 'leader' | 'member';
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
}

export function useSpaceInvites(spaceId: string, isOwner: boolean) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['space', spaceId, 'invites'],
    queryFn: () => api.get<{ invites: SpaceInviteRow[] }>(`/api/spaces/${spaceId}/invites`),
    enabled: authReady && !!spaceId && isOwner,
    staleTime: 15_000,
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
    isPinned?: boolean;
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
    isPinned?: boolean;
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
      isPinned: thread.isPinned === true,
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
      isPinned: note.isPinned === true,
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
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['space', spaceId, 'items'],
    queryFn: async () => {
      const bootstrap = queryClient.getQueryData<{ space: SpaceDetail; items: SpaceContentItem[] }>(bootstrapQueryKey(spaceId));
      if (bootstrap?.items) return bootstrap.items;
      const data = await api.get<SpaceItemsResponse>(`/api/spaces/${spaceId}/items`);
      return mapSpaceItemsResponse(data);
    },
    enabled: authReady && !!spaceId,
    staleTime: 30_000,
  });
}

/** Single request for space + items; use on SpacePage for one round-trip. Populates cache for useSpace/useSpaceItems. */
export function useSpaceBootstrap(spaceId: string) {
  // Same gate its siblings already carry — the cached bootstrap below still paints at once.
  const authReady = useAuthReady();
  const cachedBootstrap = spaceId ? getCachedSpaceBootstrap(spaceId) : undefined;
  const opts = getSpaceBootstrapQueryOptions(spaceId);
  return useQuery({
    ...opts,
    enabled: authReady && !!spaceId,
    initialData: cachedBootstrap,
    initialDataUpdatedAt: cachedBootstrap ? Date.now() - 15_000 : undefined,
  });
}
