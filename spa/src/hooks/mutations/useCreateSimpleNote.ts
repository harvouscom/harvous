import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import {
  prependSpaceNoteToCache,
  removeSpaceNoteFromCache,
  spaceNotesQueryKey,
  type SpaceNotesPage,
} from '../../lib/space-notes-cache';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import {
  getNoteIdFromCreateResponse,
  seedNoteFromCreateResponse,
} from '../queries/useNote';
import { mergeNoteTagsInCache, previewNoteTagsFromContent, type NoteTagRow } from '../../lib/note-tags-cache';
import type { SpaceNoteRow } from '../queries/useSpace';
import { isOfflineError } from './withOfflineQueue';
import { createNoteOffline } from '@/utils/offline-mutations';
import { getPersistedUserId } from '@/utils/user-id';
import { isOfflineModeEnabled } from '@/utils/offline-mode';

/** Sentinel the mutationFn returns when the create couldn't reach the server and was queued offline. */
type OfflineQueuedCreate = { offlineQueued: true };
type CreateResult = CreateNoteResponse | OfflineQueuedCreate;
function isOfflineQueuedCreate(data: CreateResult): data is OfflineQueuedCreate {
  return (data as OfflineQueuedCreate).offlineQueued === true;
}

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
  linkedFromNoteId?: string;
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
  tags?: NoteTagRow[];
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
    mutationFn: async ({ spaceId, title = '', content = '<p></p>', noteType = 'default', linkedFromNoteId }: CreateSimpleNoteBody): Promise<CreateResult> => {
      const sid = normalizedSpaceIdForApi(spaceId);
      try {
        return await api.post<CreateNoteResponse>('/api/notes/create', {
          spaceId: sid,
          title,
          content,
          noteType,
          threadId: '',
          ...(linkedFromNoteId ? { linkedFromNoteId } : {}),
        });
      } catch (err) {
        // Offline: don't fail the mutation. onSuccess persists it to the durable queue
        // (keyed to the optimistic id) so it syncs on reconnect; the optimistic row stays.
        if (isOfflineError(err)) return { offlineQueued: true };
        throw err;
      }
    },
    onMutate: async (variables) => {
      const sid = normalizedSpaceIdForApi(variables.spaceId);
      const key = spaceNotesQueryKey(sid);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(key);
      // Use the offline-db `local_*` id format so an offline create can adopt this exact id,
      // which is what lets sync-cache-bridge reconcile it to the server id later.
      const optimisticId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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
    onSuccess: async (data, variables, context) => {
      const sid = normalizedSpaceIdForApi(variables.spaceId);

      // Offline path: the server was unreachable. Persist durably under the optimistic id so
      // the background loop pushes it on reconnect, and leave the optimistic row in place.
      if (isOfflineQueuedCreate(data)) {
        const userId = getPersistedUserId();
        if (userId && context?.optimisticId && isOfflineModeEnabled()) {
          await createNoteOffline(userId, {
            id: context.optimisticId,
            title: variables.title ?? '',
            content: variables.content ?? '<p></p>',
            spaceId: sid,
            noteType: variables.noteType ?? 'default',
            linkedFromNoteId: variables.linkedFromNoteId ?? null,
          });
        }
        return;
      }

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
        const tagsFromServer = Array.isArray(data?.tags) ? data.tags : null;
        if (tagsFromServer) {
          mergeNoteTagsInCache(queryClient, noteId, tagsFromServer);
        } else {
          mergeNoteTagsInCache(
            queryClient,
            noteId,
            previewNoteTagsFromContent(
              created.title ?? variables.title ?? '',
              created.content ?? variables.content ?? '',
              {
                primary: typeof created.primaryCollection === 'string' ? created.primaryCollection : null,
                secondaries: Array.isArray(created.secondaryCollections)
                  ? created.secondaryCollections.filter((x): x is string => typeof x === 'string')
                  : [],
              },
            ),
          );
        }
        try {
          window.dispatchEvent(new CustomEvent('noteCreated', { detail: { noteId, spaceId: sid } }));
        } catch {
          /* ignore */
        }
      }
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      invalidatePrototypeSpaceDerivedQueries(queryClient, sid);
      if (variables.linkedFromNoteId) {
        queryClient.invalidateQueries({ queryKey: ['note', variables.linkedFromNoteId] });
      }
    },
    onError: (_err, _variables, context) => {
      if (context?.previous && context.sid) {
        queryClient.setQueryData(spaceNotesQueryKey(context.sid), context.previous);
      }
    },
  });
}
