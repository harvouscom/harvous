import { useMutation, useQueryClient } from '@tanstack/react-query';
import { computeNoteFolderAdditionPatch } from '@/utils/folder-bulk-actions';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { updateSpaceNoteInCache } from '../../lib/space-notes-cache';
import type { SpaceNoteRow } from '../queries/useSpace';
import { useUpdateNote } from './useUpdateNote';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { prototypeFolderRegistryQueryKey } from './usePrototypeFolderRegistry';

interface AddNotesToFolderInput {
  rows: SpaceNoteRow[];
  folderName: string;
  spaceId: string;
}

/** Add folder label to one or more notes (notes are kept; may move from Unsorted). */
export function useAddNotesToFolder() {
  const updateNote = useUpdateNote();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rows, folderName, spaceId }: AddNotesToFolderInput) => {
      const bucket = folderName.trim();
      if (!bucket) throw new Error('Folder name is required');

      const toUpdate: { row: SpaceNoteRow; patch: NonNullable<ReturnType<typeof computeNoteFolderAdditionPatch>> }[] =
        [];
      for (const row of rows) {
        const patch = computeNoteFolderAdditionPatch(
          {
            primaryCollection: row.primaryCollection ?? null,
            secondaryCollections: row.secondaryCollections ?? [],
            collectionPinned: row.collectionPinned,
            collectionUserOverride: row.collectionUserOverride,
          },
          bucket,
        );
        if (patch) toUpdate.push({ row, patch });
      }
      if (toUpdate.length === 0) {
        throw new Error('No notes were added to this folder');
      }

      await Promise.all(
        toUpdate.map(({ row, patch }) =>
          updateNote.mutateAsync({
            noteId: row.id,
            title: row.title ?? '',
            content: row.content ?? '',
            primaryCollection: patch.primaryCollection,
            secondaryCollections: patch.secondaryCollections,
            collectionUserOverride: patch.collectionUserOverride,
          }),
        ),
      );

      const sid = normalizePrototypeApiSpaceId(spaceId);
      try {
        await api.post(`/api/spaces/${encodeURIComponent(sid)}/folder-registry/remove-label`, {
          folderName: bucket,
        });
      } catch {
        // Non-fatal — notes now carry the label.
      }

      return { addedCount: toUpdate.length, updates: toUpdate };
    },
    onSuccess: (data, variables) => {
      const bucket = variables.folderName.trim();
      for (const { row, patch } of data.updates) {
        updateSpaceNoteInCache(queryClient, variables.spaceId, row.id, {
          primaryCollection: patch.primaryCollection,
          secondaryCollections: patch.secondaryCollections,
          collectionUserOverride: patch.collectionUserOverride,
        });
      }
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: prototypeFolderRegistryQueryKey(sid) });
      invalidatePrototypeSpaceDerivedQueries(queryClient, variables.spaceId);
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
    },
  });
}
