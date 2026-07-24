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
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { getPersistedUserId } from '@/utils/user-id';
import { isOfflineModeEnabled } from '@/utils/offline-mode';
import { trackSessionContentCreated } from '@/utils/session-xp-client';

/** Sentinel the mutationFn returns when the create couldn't reach the server and was queued offline. */
type OfflineQueuedCreate = { offlineQueued: true };
type CreateResult = CreateNoteResponse | OfflineQueuedCreate;
function isOfflineQueuedCreate(data: CreateResult): data is OfflineQueuedCreate {
  return (data as OfflineQueuedCreate).offlineQueued === true;
}

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

export function createNoteCacheSpaceIds(
  targetSpaceId: string,
  canonicalHomeSpaceId?: string | null,
): string[] {
  const target = normalizedSpaceIdForApi(targetSpaceId);
  const home = canonicalHomeSpaceId
    ? normalizedSpaceIdForApi(canonicalHomeSpaceId)
    : target;
  return [...new Set([home, target])];
}

/** User-visible failure for prototype compose (and any caller of useCreateSimpleNote). */
export function alertCreateNoteFailure(err: unknown): void {
  const msg =
    err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Failed to create note';
  alert(msg);
}

export interface CreateSimpleNoteBody {
  spaceId: string;
  title?: string;
  content?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  linkedFromNoteId?: string;
  threadId?: string;
  startedFromTemplateId?: string | null;
  startedFromTemplateName?: string | null;
  /** Shared spaces require connectivity in the foundation — pass `false` to fail loudly instead of queueing offline. */
  allowOffline?: boolean;
  /** Shared-space context used only for contextual cache seeding. */
  contextSpaceId?: string | null;
  /** Canonical My Home list that must retain every created note. */
  canonicalHomeSpaceId?: string | null;
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
    primaryCollection?: string | null;
    secondaryCollections?: string[];
    currentVersionId?: string | null;
  };
  currentVersion?: number;
  currentVersionId?: string | null;
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
    mutationFn: async ({
      spaceId,
      title = '',
      content = '<p></p>',
      noteType = 'default',
      linkedFromNoteId,
      threadId,
      startedFromTemplateId,
      startedFromTemplateName,
      allowOffline = true,
    }: CreateSimpleNoteBody): Promise<CreateResult> => {
      const sid = normalizedSpaceIdForApi(spaceId);
      try {
        return await api.post<CreateNoteResponse>('/api/notes/create', {
          spaceId: sid,
          title,
          content,
          noteType,
          threadId: threadId ?? '',
          scriptureVersion: getEffectiveDefaultTranslation(),
          ...(linkedFromNoteId ? { linkedFromNoteId } : {}),
          ...(startedFromTemplateId
            ? {
                startedFromTemplateId,
                startedFromTemplateName: startedFromTemplateName ?? null,
              }
            : {}),
        });
      } catch (err) {
        // Offline: don't fail the mutation. onSuccess persists it to the durable queue
        // (keyed to the optimistic id) so it syncs on reconnect; the optimistic row stays.
        // Shared spaces require connectivity in the foundation — fail loudly instead.
        if (isOfflineError(err) && allowOffline) return { offlineQueued: true };
        throw err;
      }
    },
    onMutate: async (variables) => {
      const targetSpaceIds = createNoteCacheSpaceIds(
        variables.spaceId,
        variables.canonicalHomeSpaceId,
      );
      await Promise.all(
        targetSpaceIds.map((targetSpaceId) =>
          queryClient.cancelQueries({ queryKey: spaceNotesQueryKey(targetSpaceId) }),
        ),
      );
      const previous = targetSpaceIds.map(
        (targetSpaceId) =>
          [
            targetSpaceId,
            queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(
              spaceNotesQueryKey(targetSpaceId),
            ),
          ] as const,
      );
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
      for (const targetSpaceId of targetSpaceIds) {
        prependSpaceNoteToCache(queryClient, targetSpaceId, optimistic);
      }
      return { previous, targetSpaceIds, optimisticId };
    },
    onSuccess: async (data, variables, context) => {
      const sid = normalizedSpaceIdForApi(variables.spaceId);
      const homeSid = variables.canonicalHomeSpaceId
        ? normalizedSpaceIdForApi(variables.canonicalHomeSpaceId)
        : sid;
      const targetSpaceIds =
        context?.targetSpaceIds ??
        createNoteCacheSpaceIds(variables.spaceId, variables.canonicalHomeSpaceId);

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
        for (const targetSpaceId of targetSpaceIds) {
          removeSpaceNoteFromCache(queryClient, targetSpaceId, context.optimisticId);
        }
      }
      if (noteId && created) {
        const row = noteRowFromCreateResponse(created, variables);
        for (const targetSpaceId of targetSpaceIds) {
          prependSpaceNoteToCache(queryClient, targetSpaceId, row);
        }
        if (variables.contextSpaceId) {
          seedNoteFromCreateResponse(
            queryClient,
            created as Record<string, unknown> & { id: string },
            homeSid,
            {
              currentVersion: data.currentVersion,
              currentVersionId: data.currentVersionId ?? created.currentVersionId,
            },
          );
        }
        seedNoteFromCreateResponse(
          queryClient,
          created as Record<string, unknown> & { id: string },
          variables.spaceId,
          {
            currentVersion: data.currentVersion,
            currentVersionId: data.currentVersionId ?? created.currentVersionId,
            contextSpaceId: variables.contextSpaceId,
          },
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
        trackSessionContentCreated(noteId);
      }
      for (const targetSpaceId of targetSpaceIds) {
        queryClient.invalidateQueries({ queryKey: spaceNotesQueryKey(targetSpaceId) });
        queryClient.invalidateQueries({ queryKey: ['space', targetSpaceId, 'bootstrap'] });
        invalidatePrototypeSpaceDerivedQueries(queryClient, targetSpaceId);
      }
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      if (variables.contextSpaceId) {
        queryClient.invalidateQueries({ queryKey: ['space', sid, 'activity-preview'] });
        queryClient.invalidateQueries({ queryKey: ['space', sid, 'group-threads'] });
      }
      if (variables.linkedFromNoteId) {
        queryClient.invalidateQueries({ queryKey: ['note', variables.linkedFromNoteId] });
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'prototype' &&
            query.queryKey[1] === 'note' &&
            query.queryKey[3] === 'thread',
        });
        queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sid, 'study-threads'] });
      }
    },
    onError: (_err, _variables, context) => {
      for (const [spaceId, previous] of context?.previous ?? []) {
        if (context?.optimisticId) {
          removeSpaceNoteFromCache(queryClient, spaceId, context.optimisticId);
        }
        queryClient.setQueryData(spaceNotesQueryKey(spaceId), previous);
      }
    },
  });
}
