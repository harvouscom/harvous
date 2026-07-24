import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

type ThreadNoteApiRow = {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  noteType?: unknown;
  simpleNoteId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastUpdated?: unknown;
  contentEncrypted?: unknown;
  authorUserId?: unknown;
  authorDisplayName?: unknown;
  authorColor?: unknown;
  isOwnNote?: unknown;
  contextSpaceId?: unknown;
  threadId?: unknown;
};

export type SharedThreadNote = {
  id: string;
  title: string | null;
  content: string;
  noteType: string;
  simpleNoteId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastUpdated: string | null;
  authorUserId: string | null;
  authorDisplayName: string;
  authorColor: string;
  isOwnNote: boolean;
  context: {
    spaceId: string;
    threadId: string;
  };
};

export type ThreadNotesPage = {
  notes: SharedThreadNote[];
  hasMore: boolean;
  offset: number;
  limit: number;
};

export function flattenThreadNotePages(
  pages: Array<Pick<ThreadNotesPage, 'notes'>> | undefined,
): SharedThreadNote[] {
  return pages?.flatMap((page) => page.notes) ?? [];
}

export function nextThreadNotesOffset(page: Pick<ThreadNotesPage, 'hasMore' | 'offset' | 'limit'>) {
  return page.hasMore ? page.offset + page.limit : undefined;
}

export const threadNotesQueryKey = (threadId: string | undefined, spaceId: string | undefined) =>
  ['thread', threadId, 'notes', normalizePrototypeApiSpaceId(spaceId)] as const;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Keep the drilldown contract intentionally smaller than the canonical note record. */
export function adaptSharedThreadNote(
  row: ThreadNoteApiRow,
  context: { spaceId: string; threadId: string },
): SharedThreadNote | null {
  const id = stringOrNull(row.id);
  if (!id || row.contentEncrypted === true) return null;
  const apiSpaceId = stringOrNull(row.contextSpaceId);
  const apiThreadId = stringOrNull(row.threadId);
  if ((apiSpaceId && apiSpaceId !== context.spaceId) || (apiThreadId && apiThreadId !== context.threadId)) {
    return null;
  }
  return {
    id,
    title: stringOrNull(row.title),
    content: typeof row.content === 'string' ? row.content : '',
    noteType: stringOrNull(row.noteType) ?? 'default',
    simpleNoteId: typeof row.simpleNoteId === 'number' ? row.simpleNoteId : null,
    createdAt: stringOrNull(row.createdAt),
    updatedAt: stringOrNull(row.updatedAt),
    lastUpdated: stringOrNull(row.lastUpdated) ?? stringOrNull(row.updatedAt) ?? stringOrNull(row.createdAt),
    authorUserId: stringOrNull(row.authorUserId),
    authorDisplayName: stringOrNull(row.authorDisplayName) ?? 'Member',
    authorColor: stringOrNull(row.authorColor) ?? 'blue',
    isOwnNote: row.isOwnNote === true,
    context,
  };
}

export function useThreadNotes(threadId: string | undefined, spaceId: string | undefined, limit = 20) {
  const authReady = useAuthReady();
  const normalizedSpaceId = normalizePrototypeApiSpaceId(spaceId);
  return useInfiniteQuery({
    queryKey: threadNotesQueryKey(threadId, normalizedSpaceId),
    enabled: authReady && Boolean(threadId && normalizedSpaceId),
    queryFn: async ({ pageParam = 0 }): Promise<ThreadNotesPage> => {
      const response = await api.get<{
        notes?: ThreadNoteApiRow[];
        hasMore?: boolean;
        offset?: number;
        limit?: number;
      }>(`/api/threads/${encodeURIComponent(threadId!)}/notes`, { offset: pageParam, limit });
      return {
        notes: (response.notes ?? [])
          .map((row) =>
            adaptSharedThreadNote(row, {
              spaceId: normalizedSpaceId!,
              threadId: threadId!,
            }),
          )
          .filter((row): row is SharedThreadNote => row !== null),
        hasMore: response.hasMore === true,
        offset: response.offset ?? pageParam,
        limit: response.limit ?? limit,
      };
    },
    getNextPageParam: nextThreadNotesOffset,
    initialPageParam: 0,
    staleTime: 30_000,
  });
}
