import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { StudyThreadCluster } from '../queries/usePrototypeStudyThreads';

export interface UpdateStudyThreadTitleVars {
  /** The representative note id that carries the thread name. */
  repNoteId: string;
  /** Prototype home space — scopes cluster graph to match Threads list. */
  spaceId?: string | null;
  /** New manual name. Omit when only toggling flags. */
  title?: string | null;
  /** Manual vs automatic naming (folder `collectionUserOverride` parity). */
  userOverride?: boolean;
  /** Freeze auto updates when the cluster changes. */
  pinned?: boolean;
}

/**
 * Persists study-thread name + automatic/manual/pinned state on the representative note.
 */
export function useUpdateStudyThreadTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ repNoteId, spaceId, title, userOverride, pinned }: UpdateStudyThreadTitleVars) => {
      const scopeId = normalizePrototypeApiSpaceId(spaceId ?? undefined);
      if (!scopeId) {
        return Promise.reject(new Error('Space is required to save a thread name'));
      }
      const qs = `?spaceId=${encodeURIComponent(scopeId)}`;
      return api.patch<{ success: boolean; title?: string | null; userOverride?: boolean; pinned?: boolean }>(
        `/api/notes/${encodeURIComponent(repNoteId)}/study-thread-title${qs}`,
        {
          ...(title !== undefined ? { title } : {}),
          ...(userOverride !== undefined ? { userOverride } : {}),
          ...(pinned !== undefined ? { pinned } : {}),
        },
      );
    },
    onSuccess: (_data, vars) => {
      const scopeId = normalizePrototypeApiSpaceId(vars.spaceId ?? undefined) ?? '';

      if (vars.userOverride === false || vars.title !== undefined) {
        queryClient.setQueriesData<StudyThreadCluster[]>(
          {
            predicate: (query) =>
              Array.isArray(query.queryKey) &&
              query.queryKey[0] === 'prototype' &&
              query.queryKey[1] === 'space' &&
              query.queryKey[3] === 'study-threads',
          },
          (old) => {
            if (!old?.length) return old;
            return old.map((cluster) => {
              const inCluster =
                cluster.id === vars.repNoteId || cluster.memberIds?.includes(vars.repNoteId);
              if (!inCluster) return cluster;
              if (vars.userOverride === false) {
                const autoTitle = cluster.suggestedTitle ?? cluster.title;
                return {
                  ...cluster,
                  title: autoTitle,
                  hasCustomTitle: false,
                };
              }
              const nextTitle = vars.title?.trim() || '';
              return {
                ...cluster,
                id: vars.repNoteId,
                title: nextTitle || cluster.suggestedTitle || cluster.title,
                hasCustomTitle: true,
              };
            });
          },
        );
      }

      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'prototype' &&
          query.queryKey[1] === 'note' &&
          query.queryKey[3] === 'thread' &&
          (scopeId === '' || query.queryKey[4] === scopeId),
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'prototype' &&
          query.queryKey[1] === 'space' &&
          query.queryKey[3] === 'study-threads',
      });
    },
  });
}
