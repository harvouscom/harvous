import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';

/** One editing session from GET /api/notes/:noteId/versions, shown by its last checkpoint. */
export type NoteHistorySessionWire = {
  id: string;
  version: number;
  startVersion: number;
  title: string | null;
  contentEncrypted: boolean;
  source: string;
  editorUserId: string;
  startedAt: string;
  endedAt: string;
  versionCount: number;
  isCurrent: boolean;
};

export type NoteHistoryPageWire = {
  success: boolean;
  currentVersionId: string | null;
  currentVersion: number | null;
  windowDays: number | null;
  sessions: NoteHistorySessionWire[];
  nextCursor: number | null;
  locked: { before: string } | null;
};

export const noteHistoryQueryKey = (noteId: string) => ['noteHistory', noteId] as const;

export function useNoteHistory(noteId: string, open: boolean) {
  const authReady = useAuthReady();
  return useInfiniteQuery({
    queryKey: noteHistoryQueryKey(noteId),
    queryFn: ({ pageParam }) =>
      api.get<NoteHistoryPageWire>(
        `/api/notes/${noteId}/versions`,
        pageParam === null ? undefined : { before: pageParam },
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: authReady && open && Boolean(noteId),
    staleTime: 10_000,
  });
}
