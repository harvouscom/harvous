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
import { useUpdateNote } from './useUpdateNote';
import { usePrototypeHomeSpaceId } from '../usePrototypeHomeSpaceId';
import type { FolderMutationSpaceKind } from './useAddNotesToFolder';

function normalizeSpaceId(spaceId: string): string {
  const t = (spaceId ?? '').trim();
  return t.startsWith('space_') ? t : t ? `space_${t}` : '';
}

interface PinSpaceNoteVariables {
  spaceId: string;
  noteId: string;
  isPinned: boolean;
  /** Omit to infer from the space id; pass explicitly when the caller already knows. */
  spaceKind?: FolderMutationSpaceKind;
}

export type PinSpaceNoteRequest =
  | { kind: 'personal'; input: { noteId: string; isPinned: boolean } }
  | { kind: 'shared'; sid: string; body: { itemId: string; itemType: 'note'; isPinned: boolean } };

/**
 * Decide where a pin is written. Pure so the personal/shared split can be tested
 * without mounting the hook.
 */
export function resolvePinSpaceNoteRequest(
  variables: PinSpaceNoteVariables,
  homeSpaceId: string | null,
): PinSpaceNoteRequest {
  const sid = normalizeSpaceId(variables.spaceId);
  if (!sid) throw new Error('Space ID is required');

  // Infer when the caller didn't say, so a call site that forgets still works.
  const kind: FolderMutationSpaceKind =
    variables.spaceKind ??
    (homeSpaceId && normalizeSpaceId(homeSpaceId) === sid ? 'personal' : 'shared');

  if (kind === 'personal') {
    return { kind: 'personal', input: { noteId: variables.noteId, isPinned: variables.isPinned } };
  }
  return {
    kind: 'shared',
    sid,
    body: { itemId: variables.noteId, itemType: 'note', isPinned: variables.isPinned },
  };
}

/**
 * Toggle note pin. Optimistically patches the paginated space notes list.
 *
 * Personal and shared spaces store the pin in different places, so this has to branch —
 * the same split useAddNotesToFolder/useRemoveNoteFromFolder already make:
 *
 * - shared: `SpaceNotes.isPinned`, via POST /api/spaces/:id/pin-item (owner-only).
 * - personal: `Notes.isPinned`, via PUT /api/notes/update.
 *
 * A personal space deliberately never gets a SpaceNotes row
 * (resolveCanonicalCreateScope returns associationSpaceId: null), so routing My Home
 * through pin-item looked the note up in a table it can't be in and 404'd with
 * "Note not found in space" — while the list it came from reads Notes.isPinned.
 */
export function usePinSpaceNote() {
  const queryClient = useQueryClient();
  const updateNote = useUpdateNote();
  const { homeSpaceId } = usePrototypeHomeSpaceId();

  return useMutation({
    mutationFn: async (variables: PinSpaceNoteVariables) => {
      const request = resolvePinSpaceNoteRequest(variables, homeSpaceId);

      if (request.kind === 'personal') {
        // Inherits useUpdateNote's own offline queueing, so no bespoke offline path here.
        await updateNote.mutateAsync(request.input);
        return undefined;
      }

      const { noteId, isPinned } = variables;
      const cachedNote = queryClient.getQueryData<NoteDetail>(['note', noteId]);
      const content = cachedNote?.content ?? '';

      return runOfflineFirst({
        online: () =>
          api.post<{ success?: boolean; error?: string }>(
            `/api/spaces/${encodeURIComponent(request.sid)}/pin-item`,
            request.body,
          ),
        offline: (userId) =>
          pinNoteOffline(userId, noteId, isPinned, {
            content,
            title: cachedNote?.title ?? null,
            spaceId: request.sid,
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
