import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

/**
 * A note of yours that you put into a shared space.
 *
 * The note itself stays in My Home — a space holds an association to it — so this is the one
 * kind of sharing with two places in it, and the row says both: the note, and the room.
 */
export interface MySharedSpaceNoteItem {
  noteId: string;
  title: string;
  preview?: string;
  spaceId: string;
  spaceTitle: string;
  spaceColor?: string | null;
  addedAt: string;
}

export interface MySharedSpaceNotesResponse {
  notes: MySharedSpaceNoteItem[];
}

export const mySharedSpaceNotesQueryKey = ['profile', 'my-shared-space-notes'] as const;

export function useMySharedSpaceNotes() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: mySharedSpaceNotesQueryKey,
    queryFn: () => api.get<MySharedSpaceNotesResponse>('/api/profile/my-shared-space-notes'),
    enabled: authReady,
    staleTime: 30_000,
  });
}
