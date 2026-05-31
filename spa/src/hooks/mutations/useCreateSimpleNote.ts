import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import {
  prependSpaceNoteToCache,
  removeSpaceNoteFromCache,
  spaceNotesQueryKey,
  type SpaceNotesPage,
} from '../../lib/space-notes-cache';
import { getNoteIdFromCreateResponse, seedNoteFromCreateResponse } from '../queries/useNote';
import type { SpaceNoteRow } from '../queries/useSpace';

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

/** User-visible failure for prototype compose (and any caller of useCreateSimpleNote). */
export function alertCreateNoteFailure(err: unknown): void {
  const msg =
    err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Failed to create note';
  alert(msg);
}

interface CreateSimpleNoteBody {
  spaceId: string;
  title?: string;
  content?: string;
  noteType?: 'default' | 'scripture' | 'resource';
}

interface CreateNoteResponse {
  success?: string;
  note?: {
    id: string;
    title?: string;
    content?: string;
    spaceId?: string | null;
    noteType?: string;
    createdAt?: string;
    updatedAt?: string;
    simpleNoteId?: number;
  };
  error?: string;
}

function noteRowFromCreateResponse(
  note: NonNullable<CreateNoteResponse['note']>,
  variables: CreateSimpleNoteBody,
): SpaceNoteRow {
  const now = new Date().toISOString();
  return {
    id: note.id,
    title: note.title ?? variables.title ?? '',
    content: note.content ?? variables.content ?? '<p></p>',
    noteType: note.noteType ?? variables.noteType ?? 'default',
    createdAt: note.createdAt ?? now,
    updatedAt: note.updatedAt ?? note.createdAt ?? now,
    simpleNoteId: note.simpleNoteId ?? null,
    isPinned: false,
  };
}

/**
 * Create a note in a space without surfacing threads in the UI. Server resolves thread to unorganized when omitted.
 */
export function useCreateSimpleNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ spaceId, title = '', content = '<p></p>', noteType = 'default' }: CreateSimpleNoteBody) => {
      const sid = normalizedSpaceIdForApi(spaceId);
      return api.post<CreateNoteResponse>('/api/notes/create', {
        spaceId: sid,
        title,
        content,
        noteType,
        threadId: '',
      });
    },
    onMutate: async (variables) => {
      const sid = normalizedSpaceIdForApi(variables.spaceId);
      const key = spaceNotesQueryKey(sid);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(key);
      const optimisticId = `note_pending_${Date.now()}`;
      const optimistic: SpaceNoteRow = {
        id: optimisticId,
        title: variables.title ?? '',
        content: variables.content ?? '<p></p>',
        noteType: variables.noteType ?? 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPinned: false,
      };
      prependSpaceNoteToCache(queryClient, sid, optimistic);
      return { previous, sid, optimisticId };
    },
    onSuccess: (data, variables, context) => {
      const sid = normalizedSpaceIdForApi(variables.spaceId);
      const noteId = getNoteIdFromCreateResponse(data);
      const created = data?.note;
      if (context?.optimisticId) {
        removeSpaceNoteFromCache(queryClient, sid, context.optimisticId);
      }
      if (noteId && created) {
        prependSpaceNoteToCache(queryClient, sid, noteRowFromCreateResponse(created, variables));
        seedNoteFromCreateResponse(
          queryClient,
          created as Record<string, unknown> & { id: string },
          variables.spaceId,
        );
        try {
          window.dispatchEvent(new CustomEvent('noteCreated', { detail: { noteId, spaceId: sid } }));
        } catch {
          /* ignore */
        }
      }
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
    },
    onError: (_err, _variables, context) => {
      if (context?.previous && context.sid) {
        queryClient.setQueryData(spaceNotesQueryKey(context.sid), context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      const id = normalizedSpaceIdForApi(variables.spaceId);
      void queryClient.invalidateQueries({ queryKey: ['space', id, 'notes'] });
    },
  });
}
