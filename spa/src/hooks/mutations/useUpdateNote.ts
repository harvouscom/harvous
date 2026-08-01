import { useMutation, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { updateSpaceNoteInCache } from '../../lib/space-notes-cache';
import {
  mergeNoteTagsInCache,
  previewNoteTagsFromContent,
  type NoteTagRow,
} from '../../lib/note-tags-cache';
import { getNoteQueryOptions, type NoteDetail } from '../queries/useNote';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { isOfflineError, runOfflineFirst } from './withOfflineQueue';
import { updateNoteOffline } from '@/utils/offline-mutations';

export interface UpdateNoteInput {
  noteId: string;
  title: string;
  content: string;
  /** Shared read context for cache/version resolution. Never sent to the canonical endpoint. */
  contextSpaceId?: string | null;
  scriptureVersion?: string;
  primaryCollection?: string | null;
  secondaryCollections?: string[];
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
  bumpUpdatedAt?: boolean;
  startedFromTemplateId?: string | null;
  startedFromTemplateName?: string | null;
}

interface UpdateNoteResponse {
  success: boolean;
  note?: {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
    currentVersionId?: string | null;
  };
  currentVersion?: number;
  currentVersionId?: string | null;
  tags?: NoteTagRow[];
  scriptureResults?: unknown;
  processedContent?: string | null;
}

export function getCurrentCachedNoteVersion(queryClient: QueryClient, noteId: string): number | undefined {
  const versions = queryClient
    .getQueriesData<NoteDetail>({ queryKey: ['note', noteId] })
    .map(([, note]) => note?.currentVersion)
    .filter((version): version is number => typeof version === 'number' && Number.isFinite(version));
  return versions.length > 0 ? Math.max(...versions) : undefined;
}

export function buildUpdateNoteBody(
  input: UpdateNoteInput,
  expectedVersion?: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    noteId: input.noteId,
    title: input.title,
    content: input.content,
  };
  if (input.bumpUpdatedAt === false) body.bumpUpdatedAt = false;
  if (input.scriptureVersion !== undefined) body.scriptureVersion = input.scriptureVersion;
  if (input.startedFromTemplateId !== undefined) {
    body.startedFromTemplateId = input.startedFromTemplateId;
  }
  if (input.startedFromTemplateName !== undefined) {
    body.startedFromTemplateName = input.startedFromTemplateName;
  }
  if (!input.contextSpaceId?.trim()) {
    if (input.primaryCollection !== undefined) body.primaryCollection = input.primaryCollection;
    if (input.secondaryCollections !== undefined) body.secondaryCollections = input.secondaryCollections;
    if (input.collectionPinned !== undefined) body.collectionPinned = input.collectionPinned;
    if (input.collectionUserOverride !== undefined) {
      body.collectionUserOverride = input.collectionUserOverride;
    }
  }
  if (expectedVersion !== undefined) body.expectedVersion = expectedVersion;
  return body;
}

export class MissingExpectedNoteVersionError extends Error {
  constructor(noteId: string) {
    super(`Cannot save ${noteId} safely because its current version could not be loaded. Refresh and try again.`);
    this.name = 'MissingExpectedNoteVersionError';
  }
}

export async function requireExpectedNoteVersion(
  queryClient: QueryClient,
  noteId: string,
  contextSpaceId?: string | null,
): Promise<number> {
  const cached = getCurrentCachedNoteVersion(queryClient, noteId);
  if (cached !== undefined) return cached;
  const options = getNoteQueryOptions(noteId, contextSpaceId);
  const authoritative = await queryClient.fetchQuery({
    ...options,
    staleTime: 0,
  });
  if (
    typeof authoritative.currentVersion !== 'number' ||
    !Number.isFinite(authoritative.currentVersion)
  ) {
    throw new MissingExpectedNoteVersionError(noteId);
  }
  return authoritative.currentVersion;
}

export function setContextualNoteData(
  queryClient: QueryClient,
  noteId: string,
  updater: (note: NoteDetail) => NoteDetail,
): void {
  queryClient.setQueriesData<NoteDetail>(
    { queryKey: ['note', noteId] },
    (note) => (note ? updater(note) : note),
  );
}

export type UpdateNoteMutationContext = {
  previousNotes: [QueryKey, NoteDetail | undefined][];
};

export async function rollbackFailedNoteUpdate(
  queryClient: QueryClient,
  error: unknown,
  noteId: string,
  context?: UpdateNoteMutationContext,
  attempted?: { title?: string | null; content?: string | null },
): Promise<void> {
  for (const [queryKey, note] of context?.previousNotes ?? []) {
    queryClient.setQueryData(queryKey, note);
  }
  if (error instanceof APIError && error.status === 409) {
    // Someone else's save landed first. The refetch below replaces the body, so
    // the text this device typed has to be preserved *before* it disappears —
    // otherwise a co-editing conflict silently eats an edit.
    if (typeof attempted?.content === 'string') {
      try {
        const { saveNoteDraft } = await import('@/utils/note-draft-store');
        saveNoteDraft(noteId, {
          title: attempted.title ?? '',
          content: attempted.content,
        });
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: 'Someone saved first. Your version is saved as a draft.',
              type: 'info',
            },
          }),
        );
      } catch {
        /* the refetch below still needs to run */
      }
    }
    await queryClient.invalidateQueries({
      queryKey: ['note', noteId],
      refetchType: 'all',
    });
    return;
  }
  if (error instanceof APIError && (error.status === 404 || error.status === 403)) {
    // The write path answers "not found" for both a genuinely missing note and one
    // this viewer isn't authorized to edit (server deliberately doesn't distinguish,
    // so note existence never leaks). Either way the rollback above just discarded
    // what was typed — without this, that loss is silent and reads as data eaten by
    // a bug rather than a permission the viewer never had.
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: {
          message: "You can't edit this note — your changes weren't saved.",
          type: 'error',
        },
      }),
    );
    await queryClient.invalidateQueries({ queryKey: ['note', noteId], refetchType: 'all' });
  }
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
    mutationFn: async (input: UpdateNoteInput) => {
      const {
        noteId,
        title,
        content,
      } = input;
      // Online-first; if offline, queue the edit. `seed` (from the open note's cache) lets a
      // pre-existing server note that was never mirrored locally still queue its edit — the
      // edit coalesces into a pending create for offline-authored notes. Scripture pills are
      // not processed offline; they resolve on sync.
      const cached =
        queryClient.getQueriesData<NoteDetail>({ queryKey: ['note', noteId] })
          .map(([, note]) => note)
          .find(Boolean);
      const offline = (userId: string) =>
        updateNoteOffline(
          userId,
          noteId,
          { title, content },
          {
            content,
            currentVersion: cached?.currentVersion,
            title,
            spaceId: cached?.spaceId ?? null,
            threadId: cached?.threads?.[0]?.id,
            noteType: (cached?.noteType as 'default' | 'scripture' | 'resource' | undefined) ?? 'default',
          },
        ).then(() => undefined);
      let expectedVersion: number;
      try {
        expectedVersion = await requireExpectedNoteVersion(
          queryClient,
          noteId,
          input.contextSpaceId,
        );
      } catch (error) {
        if (error instanceof MissingExpectedNoteVersionError) throw error;
        if (!input.contextSpaceId?.trim() && isOfflineError(error)) {
          return runOfflineFirst<UpdateNoteResponse>({
            online: () => Promise.reject(error),
            offline,
          });
        }
        throw error;
      }
      const body = buildUpdateNoteBody(input, expectedVersion);
      // A co-edited note must never sit in the offline queue: the queued write
      // carries a version that will be stale by the time it flushes, so it would
      // 409 on reconnect with nobody around to recover the text. Surface the
      // failure now instead. (The contextSpaceId branch already bypasses the queue;
      // this makes the co-edit case explicit rather than incidental.)
      const skipOfflineQueue = Boolean(input.contextSpaceId?.trim()) || cached?.coEditEnabled === true;
      if (skipOfflineQueue) {
        const online = await api.put<UpdateNoteResponse>('/api/notes/update', body as any);
        return { online, queued: false, localId: null };
      }
      return runOfflineFirst({
        online: () => api.put<UpdateNoteResponse>('/api/notes/update', body as any),
        offline,
      });
    },
    onMutate: async (variables): Promise<UpdateNoteMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['note', variables.noteId] });
      const previousNotes = queryClient.getQueriesData<NoteDetail>({
        queryKey: ['note', variables.noteId],
      });
      const optimisticUpdatedAt = new Date().toISOString();
      const patchCanonicalOrganization = !variables.contextSpaceId?.trim();
      setContextualNoteData(queryClient, variables.noteId, (prev) => ({
        ...prev,
        title: variables.title,
        content: variables.content,
        updatedAt: optimisticUpdatedAt,
        __contentIsPreview: false,
        ...(patchCanonicalOrganization && variables.primaryCollection !== undefined
          ? { primaryCollection: variables.primaryCollection }
          : {}),
        ...(patchCanonicalOrganization && variables.secondaryCollections !== undefined
          ? { secondaryCollections: variables.secondaryCollections }
          : {}),
        ...(patchCanonicalOrganization && variables.collectionPinned !== undefined
          ? { collectionPinned: variables.collectionPinned }
          : {}),
        ...(patchCanonicalOrganization && variables.collectionUserOverride !== undefined
          ? { collectionUserOverride: variables.collectionUserOverride }
          : {}),
        ...(variables.startedFromTemplateId !== undefined
          ? { startedFromTemplateId: variables.startedFromTemplateId }
          : {}),
        ...(variables.startedFromTemplateName !== undefined
          ? { startedFromTemplateName: variables.startedFromTemplateName }
          : {}),
      }));
      return { previousNotes };
    },
    onError: (error, variables, context) => {
      return rollbackFailedNoteUpdate(queryClient, error, variables.noteId, context, {
        title: variables.title,
        content: variables.content,
      });
    },
    onSuccess: (outcome, variables) => {
      const data = outcome.online;
      const queuedOffline = outcome.queued;
      const patchCanonicalOrganization = !variables.contextSpaceId?.trim();
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
      setContextualNoteData(
        queryClient,
        variables.noteId,
        (prev) => {
          if (typeof prev.spaceId === 'string' && prev.spaceId.length > 0) affectedSpaceId = prev.spaceId;
          if (Array.isArray(prev.threads)) {
            affectedThreadIds = prev.threads
              .map((t) => (typeof t?.id === 'string' ? t.id : null))
              .filter((id): id is string => !!id);
          }
          return {
            ...prev,
            title: data?.note?.title ?? variables.title,
            content: processed,
            updatedAt: data?.note?.updatedAt ?? new Date().toISOString(),
            ...(typeof data?.currentVersion === 'number'
              ? { currentVersion: data.currentVersion }
              : {}),
            ...(data?.currentVersionId !== undefined
              ? { currentVersionId: data.currentVersionId }
              : {}),
            // Authoritative full content now in cache — clear any list-preview flag.
            __contentIsPreview: false,
            ...(patchCanonicalOrganization && variables.primaryCollection !== undefined
              ? { primaryCollection: variables.primaryCollection }
              : {}),
            ...(patchCanonicalOrganization && variables.secondaryCollections !== undefined
              ? { secondaryCollections: variables.secondaryCollections }
              : {}),
            ...(patchCanonicalOrganization && variables.collectionPinned !== undefined
              ? { collectionPinned: variables.collectionPinned }
              : {}),
            ...(patchCanonicalOrganization && variables.collectionUserOverride !== undefined
              ? { collectionUserOverride: variables.collectionUserOverride }
              : {}),
            ...(data?.note && Array.isArray((data.note as unknown as { dismissedAutoTags?: string[] }).dismissedAutoTags)
              ? { dismissedAutoTags: (data.note as unknown as { dismissedAutoTags: string[] }).dismissedAutoTags }
              : {}),
            ...(variables.startedFromTemplateId !== undefined
              ? { startedFromTemplateId: variables.startedFromTemplateId }
              : {}),
            ...(variables.startedFromTemplateName !== undefined
              ? { startedFromTemplateName: variables.startedFromTemplateName }
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
            primary: patchCanonicalOrganization ? variables.primaryCollection : undefined,
            secondaries: patchCanonicalOrganization ? variables.secondaryCollections : undefined,
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
          ...(patchCanonicalOrganization && variables.primaryCollection !== undefined
            ? { primaryCollection: variables.primaryCollection }
            : {}),
          ...(patchCanonicalOrganization && variables.secondaryCollections !== undefined
            ? { secondaryCollections: variables.secondaryCollections }
            : {}),
          ...(patchCanonicalOrganization && variables.collectionPinned !== undefined
            ? { collectionPinned: variables.collectionPinned }
            : {}),
          ...(patchCanonicalOrganization && variables.collectionUserOverride !== undefined
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
        queryClient.invalidateQueries({
          queryKey: ['note', variables.noteId],
          refetchType: 'inactive',
        });
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
