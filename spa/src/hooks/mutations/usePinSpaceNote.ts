import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  patchSpaceNotesInfiniteCache,
  restoreSpaceNotesCaches,
  snapshotSpaceNotesCaches,
  spaceNotesQueryKey,
} from '../../lib/space-notes-cache';
import type { NoteDetail } from '../queries/useNote';
import { runOfflineFirst } from './withOfflineQueue';
import { pinNoteOffline } from '@/utils/offline-mutations';

function normalizeSpaceId(spaceId: string): string {
  const t = (spaceId ?? '').trim();
  return t.startsWith('space_') ? t : t ? `space_${t}` : '';
}

interface PinSpaceNoteVariables {
  spaceId: string;
  noteId: string;
  isPinned: boolean;
}

/**
 * Toggle note pin for a space (owner-only API). Optimistically patches paginated space notes list.
 */
export function usePinSpaceNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spaceId, noteId, isPinned }: PinSpaceNoteVariables) => {
      const sid = normalizeSpaceId(spaceId);
      if (!sid) throw new Error('Space ID is required');

      const cachedNote = queryClient.getQueryData<NoteDetail>(['note', noteId]);
      const content = cachedNote?.content ?? '';

      return runOfflineFirst({
        online: () =>
          api.post<{ success?: boolean; error?: string }>(`/api/spaces/${encodeURIComponent(sid)}/pin-item`, {
            itemId: noteId,
            itemType: 'note',
            isPinned,
          }),
        offline: (userId) =>
          pinNoteOffline(userId, noteId, isPinned, {
            content,
            title: cachedNote?.title ?? null,
            spaceId: sid,
            threadId: cachedNote?.threads?.[0]?.id,
            noteType: (cachedNote?.noteType as 'default' | 'scripture' | 'resource' | undefined) ?? 'default',
          }).then(() => undefined),
      });
    },
    onMutate: async (variables) => {
      const sid = normalizeSpaceId(variables.spaceId);
      if (!sid) return;
      await queryClient.cancelQueries({ queryKey: spaceNotesQueryKey(sid) });
      const previous = snapshotSpaceNotesCaches(queryClient, sid);
      patchSpaceNotesInfiniteCache(queryClient, sid, (note) =>
        note.id === variables.noteId ? { ...note, isPinned: variables.isPinned } : note,
      );
      return { previous, sid };
    },
    onError: (_err, variables, context) => {
      restoreSpaceNotesCaches(queryClient, context?.previous);
    },
    onSettled: (_data, _err, variables) => {
      const sid = normalizeSpaceId(variables.spaceId);
      if (sid) {
        queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
      }
    },
  });
}
