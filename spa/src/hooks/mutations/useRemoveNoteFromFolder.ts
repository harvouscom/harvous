import { useMutation, useQueryClient } from '@tanstack/react-query';
import { computeNoteFolderRemovalPatch } from '@/utils/folder-bulk-actions';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { updateSpaceNoteInCache } from '../../lib/space-notes-cache';
import type { SpaceNoteRow } from '../queries/useSpace';
import { useUpdateNote } from './useUpdateNote';
import {
  usePatchSpaceNoteOrganization,
  type PatchSpaceNoteOrganizationInput,
} from './usePatchSpaceNoteOrganization';
import type { UpdateNoteInput } from './useUpdateNote';
import type { FolderMutationSpaceKind } from './useAddNotesToFolder';

export interface RemoveNoteFromFolderInput {
  row: SpaceNoteRow;
  folderName: string;
  spaceId: string;
  spaceKind: FolderMutationSpaceKind;
}

export type RemoveNoteFromFolderOperation = {
  patch: NonNullable<ReturnType<typeof computeNoteFolderRemovalPatch>>;
  request:
    | { kind: 'shared'; input: PatchSpaceNoteOrganizationInput }
    | { kind: 'personal'; input: UpdateNoteInput };
};

export function buildRemoveNoteFromFolderOperation(
  input: RemoveNoteFromFolderInput,
): RemoveNoteFromFolderOperation | null {
  const patch = computeNoteFolderRemovalPatch(
    {
      primaryCollection: input.row.primaryCollection ?? null,
      secondaryCollections: input.row.secondaryCollections ?? [],
      collectionPinned: input.row.collectionPinned,
      collectionUserOverride: input.row.collectionUserOverride,
    },
    input.folderName,
  );
  if (!patch) return null;
  return {
    patch,
    request:
      input.spaceKind === 'shared'
        ? {
            kind: 'shared',
            input: {
              noteId: input.row.id,
              spaceId: input.spaceId,
              primaryCollection: patch.primaryCollection,
              secondaryCollections: patch.secondaryCollections,
              collectionPinned: patch.collectionPinned,
            },
          }
        : {
            kind: 'personal',
            input: {
              // No title/content — folder label change only. `row` is a list payload
              // whose content is truncated server-side.
              noteId: input.row.id,
              primaryCollection: patch.primaryCollection,
              secondaryCollections: patch.secondaryCollections,
              collectionPinned: patch.collectionPinned,
              collectionUserOverride: patch.collectionUserOverride,
            },
          },
  };
}

/** Remove a folder label from a single note (note is kept; may move to Unsorted). */
export function useRemoveNoteFromFolder() {
  const updateNote = useUpdateNote();
  const patchSpaceNoteOrganization = usePatchSpaceNoteOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RemoveNoteFromFolderInput) => {
      const operation = buildRemoveNoteFromFolderOperation(input);
      if (!operation) {
        throw new Error('Note is not in this folder');
      }
      if (operation.request.kind === 'shared') {
        await patchSpaceNoteOrganization.mutateAsync(operation.request.input);
      } else {
        await updateNote.mutateAsync(operation.request.input);
      }
      return operation;
    },
    onSuccess: (operation, variables) => {
      updateSpaceNoteInCache(queryClient, variables.spaceId, variables.row.id, {
        primaryCollection: operation.patch.primaryCollection,
        secondaryCollections: operation.patch.secondaryCollections,
        collectionPinned: operation.patch.collectionPinned,
        ...(variables.spaceKind === 'personal'
          ? { collectionUserOverride: operation.patch.collectionUserOverride }
          : {}),
      });
      invalidatePrototypeSpaceDerivedQueries(queryClient, variables.spaceId);
      queryClient.invalidateQueries({ queryKey: ['space', variables.spaceId, 'notes'] });
    },
  });
}
