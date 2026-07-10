import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** JSON shape returned by GET /api/notes/:noteId/activity. */
export type NoteActivityWireItem = {
  id: string;
  actorUserId: string;
  actorDisplayName: string;
  actorColor: string;
  entryKind: string;
  highlightAccentRaw: string;
  focusTitle: string;
  notesBody: string;
  miniNoteBody: string;
  anchor: {
    quote: string | null;
    prefixContext: string;
    suffixContext: string;
    status: string;
    start: number | null;
    end: number | null;
    detachedAt: string | null;
  };
  overlapsAuthorResponseIds: string[];
  createdAt: string;
  updatedAt: string | null;
};

export type NoteActivityWireGroup = {
  spaceId: string;
  spaceTitle: string;
  associationStatus: 'active' | 'archived';
  items: NoteActivityWireItem[];
};

export type NoteActivityResponse = {
  success: boolean;
  contextSpaceId?: string | null;
  groups: NoteActivityWireGroup[];
};

export function getNoteActivityQueryOptions(noteId: string, contextSpaceId?: string | null) {
  const context = contextSpaceId?.trim() || null;
  const contextQuery = context ? `?contextSpaceId=${encodeURIComponent(context)}` : '';
  return {
    queryKey: ['noteActivity', noteId, context] as const,
    queryFn: () => api.get<NoteActivityResponse>(`/api/notes/${noteId}/activity${contextQuery}`),
    staleTime: 10_000,
  };
}

export function useNoteActivity(noteId: string, contextSpaceId?: string | null) {
  return useQuery({
    ...getNoteActivityQueryOptions(noteId, contextSpaceId),
    enabled: Boolean(noteId),
  });
}
