import { useMutation, useQueryClient } from '@tanstack/react-query';
import { computeNoteFolderRemovalPatch } from '@/utils/folder-bulk-actions';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { updateSpaceNoteInCache } from '../../lib/space-notes-cache';
import type { SpaceNoteRow } from '../queries/useSpace';
import { useUpdateNote } from './useUpdateNote';

interface RemoveNoteFromFolderInput {
  row: SpaceNoteRow;
  folderName: string;
  spaceId: string;
}

/** Remove a folder label from a single note (note is kept; may move to Unsorted). */
export function useRemoveNoteFromFolder() {
  const updateNote = useUpdateNote();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ row, folderName }: RemoveNoteFromFolderInput) => {
      const patch = computeNoteFolderRemovalPatch(
        {
          primaryCollection: row.primaryCollection ?? null,
          secondaryCollections: row.secondaryCollections ?? [],
          collectionPinned: row.collectionPinned,
          collectionUserOverride: row.collectionUserOverride,
        },
        folderName,
      );
      if (!patch) {
        throw new Error('Note is not in this folder');
      }
      return updateNote.mutateAsync({
        noteId: row.id,
        title: row.title ?? '',
        content: row.content ?? '',
        primaryCollection: patch.primaryCollection,
        secondaryCollections: patch.secondaryCollections,
        collectionPinned: patch.collectionPinned,
        collectionUserOverride: patch.collectionUserOverride,
      });
    },
    onSuccess: (_data, variables) => {
      const patch = computeNoteFolderRemovalPatch(
        {
          primaryCollection: variables.row.primaryCollection ?? null,
          secondaryCollections: variables.row.secondaryCollections ?? [],
          collectionPinned: variables.row.collectionPinned,
          collectionUserOverride: variables.row.collectionUserOverride,
        },
        variables.folderName,
      );
      if (patch) {
        updateSpaceNoteInCache(queryClient, variables.spaceId, variables.row.id, {
          primaryCollection: patch.primaryCollection,
          secondaryCollections: patch.secondaryCollections,
          collectionPinned: patch.collectionPinned,
          collectionUserOverride: patch.collectionUserOverride,
        });
      }
      invalidatePrototypeSpaceDerivedQueries(queryClient, variables.spaceId);
      queryClient.invalidateQueries({ queryKey: ['space', variables.spaceId, 'notes'] });
    },
  });
}
