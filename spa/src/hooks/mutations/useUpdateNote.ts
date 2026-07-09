import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { updateSpaceNoteInCache } from '../../lib/space-notes-cache';
import {
  mergeNoteTagsInCache,
  previewNoteTagsFromContent,
  type NoteTagRow,
} from '../../lib/note-tags-cache';
import type { NoteDetail } from '../queries/useNote';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { runOfflineFirst } from './withOfflineQueue';
import { updateNoteOffline } from '@/utils/offline-mutations';

interface UpdateNoteInput {
  noteId: string;
  title: string;
  content: string;
  scriptureVersion?: string;
  primaryCollection?: string | null;
  secondaryCollections?: string[];
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
  bumpUpdatedAt?: boolean;
}

interface UpdateNoteResponse {
  success: boolean;
  note?: {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
  };
  tags?: NoteTagRow[];
  scriptureResults?: unknown;
  processedContent?: string | null;
}

/**
 * Mutation hook for updating a note (title + content).
 *
 * Usage:
 *   const updateNote = useUpdateNote();
 *   await updateNote.mutateAsync({ noteId, title, content });
 *
 * On success, invalidates the note detail cache so the UI reflects the latest save.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateNoteInput) => {
      const {
        noteId,
        title,
        content,
        scriptureVersion,
        primaryCollection,
        secondaryCollections,
        collectionPinned,
        collectionUserOverride,
      } = input;
      const body: Record<string, unknown> = { noteId, title, content };
      if (input.bumpUpdatedAt === false) body.bumpUpdatedAt = false;
      if (scriptureVersion !== undefined) body.scriptureVersion = scriptureVersion;
      if (primaryCollection !== undefined) body.primaryCollection = primaryCollection;
      if (secondaryCollections !== undefined) body.secondaryCollections = secondaryCollections;
      if (collectionPinned !== undefined) body.collectionPinned = collectionPinned;
      if (collectionUserOverride !== undefined) body.collectionUserOverride = collectionUserOverride;
      // Online-first; if offline, queue the edit. `seed` (from the open note's cache) lets a
      // pre-existing server note that was never mirrored locally still queue its edit — the
      // edit coalesces into a pending create for offline-authored notes. Scripture pills are
      // not processed offline; they resolve on sync.
      const cached = queryClient.getQueryData<NoteDetail>(['note', noteId]);
      return runOfflineFirst({
        online: () => api.put<UpdateNoteResponse>('/api/notes/update', body as any),
        offline: (userId) =>
          updateNoteOffline(
            userId,
            noteId,
            { title, content },
            {
              content,
              title,
              spaceId: cached?.spaceId ?? null,
              threadId: cached?.threads?.[0]?.id,
              noteType: (cached?.noteType as 'default' | 'scripture' | 'resource' | undefined) ?? 'default',
            },
          ).then(() => undefined),
      });
    },
    onSuccess: (outcome, variables) => {
      const data = outcome.online;
      const queuedOffline = outcome.queued;
      const processed =
        typeof data?.processedContent === 'string' && data.processedContent.length > 0
          ? data.processedContent
          : variables.content;
      // Optimistically patch the note detail cache so navigating back / refreshing
      // immediately shows the typed content without waiting for the refetch to
      // round-trip. Without this, a fast refresh after typing can briefly show
      // pre-save content, which reads as "save didn't persist."
      //
      // We also read the note's space/threads from the cache here so list
      // invalidation can be scoped to just the affected space/threads instead of
      // every space and thread (the note is open, so its detail cache — populated
      // by GET …/details — has spaceId + threads). Falls back to broad invalidation
      // when those aren't known yet.
      let affectedSpaceId: string | undefined;
      let affectedThreadIds: string[] = [];
      queryClient.setQueryData<NoteDetail | undefined>(
        ['note', variables.noteId],
        (prev) => {
          if (!prev) return prev;
          if (typeof prev.spaceId === 'string' && prev.spaceId.length > 0) affectedSpaceId = prev.spaceId;
          if (Array.isArray(prev.threads)) {
            affectedThreadIds = prev.threads
              .map((t) => (typeof t?.id === 'string' ? t.id : null))
              .filter((id): id is string => !!id);
          }
          return {
            ...prev,
            title: variables.title,
            content: processed,
            updatedAt: data?.note?.updatedAt ?? new Date().toISOString(),
            // Authoritative full content now in cache — clear any list-preview flag.
            __contentIsPreview: false,
            ...(variables.primaryCollection !== undefined ? { primaryCollection: variables.primaryCollection } : {}),
            ...(variables.secondaryCollections !== undefined ? { secondaryCollections: variables.secondaryCollections } : {}),
            ...(variables.collectionPinned !== undefined ? { collectionPinned: variables.collectionPinned } : {}),
            ...(variables.collectionUserOverride !== undefined ? { collectionUserOverride: variables.collectionUserOverride } : {}),
            ...(data?.note && Array.isArray((data.note as { dismissedAutoTags?: string[] }).dismissedAutoTags)
              ? { dismissedAutoTags: (data.note as { dismissedAutoTags: string[] }).dismissedAutoTags }
              : {}),
          };
        },
      );

      const tagsFromServer = Array.isArray(data?.tags) ? data.tags : null;
      if (tagsFromServer) {
        mergeNoteTagsInCache(queryClient, variables.noteId, tagsFromServer);
      } else {
        mergeNoteTagsInCache(
          queryClient,
          variables.noteId,
          previewNoteTagsFromContent(variables.title, processed, {
            primary: variables.primaryCollection,
            secondaries: variables.secondaryCollections,
            dismissedAutoTags: queryClient.getQueryData<NoteDetail>(['note', variables.noteId])?.dismissedAutoTags,
          }),
        );
      }
      // The note detail cache was just patched optimistically with the saved
      // title/content, so we intentionally do NOT invalidate ['note', noteId] here —
      // that would trigger a redundant GET …/details on every autosave.

      // List/sidebar caches — patch the open note's row immediately; bootstrap/nav refresh in background.
      if (affectedSpaceId) {
        updateSpaceNoteInCache(queryClient, affectedSpaceId, variables.noteId, {
          title: variables.title,
          content: processed,
          updatedAt: new Date().toISOString(),
          ...(variables.primaryCollection !== undefined ? { primaryCollection: variables.primaryCollection } : {}),
          ...(variables.secondaryCollections !== undefined
            ? { secondaryCollections: variables.secondaryCollections }
            : {}),
          ...(variables.collectionPinned !== undefined ? { collectionPinned: variables.collectionPinned } : {}),
          ...(variables.collectionUserOverride !== undefined
            ? { collectionUserOverride: variables.collectionUserOverride }
            : {}),
        });
      }
      // The detail cache can miss spaceId (note opened before details loaded);
      // the update response carries the authoritative note, so prefer that over
      // falling back to invalidating every space's queries.
      if (!affectedSpaceId) {
        const serverSpaceId = (data?.note as { spaceId?: string | null } | undefined)?.spaceId;
        if (typeof serverSpaceId === 'string' && serverSpaceId.length > 0) affectedSpaceId = serverSpaceId;
      }
      // Skip background refetches when the edit was only queued offline — the network is down,
      // so they would just fail; the optimistic cache patches above already reflect the edit.
      if (!queuedOffline) {
        if (affectedSpaceId) {
          queryClient.invalidateQueries({ queryKey: ['space', affectedSpaceId, 'bootstrap'] });
        } else {
          queryClient.invalidateQueries({ queryKey: ['space'] });
        }
        if (affectedThreadIds.length > 0) {
          for (const tid of affectedThreadIds) {
            queryClient.invalidateQueries({ queryKey: ['thread', tid] });
          }
        } else {
          queryClient.invalidateQueries({ queryKey: ['thread'] });
        }
        queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
        invalidatePrototypeSpaceDerivedQueries(queryClient, affectedSpaceId);
      }
      window.dispatchEvent(
        new CustomEvent('noteUpdated', { detail: { noteId: variables.noteId, source: 'autosave' } }),
      );
    },
  });
}
