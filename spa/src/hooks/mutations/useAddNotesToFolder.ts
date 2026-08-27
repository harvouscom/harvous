import { useMutation, useQueryClient } from '@tanstack/react-query';
import { computeNoteFolderAdditionPatch } from '@/utils/folder-bulk-actions';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { updateSpaceNoteInCache } from '../../lib/space-notes-cache';
import type { SpaceNoteRow } from '../queries/useSpace';
import { useUpdateNote } from './useUpdateNote';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { prototypeFolderRegistryQueryKey } from './usePrototypeFolderRegistry';
import {
  usePatchSpaceNoteOrganization,
  type PatchSpaceNoteOrganizationInput,
} from './usePatchSpaceNoteOrganization';
import type { UpdateNoteInput } from './useUpdateNote';

export type FolderMutationSpaceKind = 'personal' | 'shared';

export interface AddNotesToFolderInput {
  rows: SpaceNoteRow[];
  folderName: string;
  spaceId: string;
  spaceKind: FolderMutationSpaceKind;
}

export type AddNotesToFolderOperation = {
  row: SpaceNoteRow;
  patch: NonNullable<ReturnType<typeof computeNoteFolderAdditionPatch>>;
  request:
    | { kind: 'shared'; input: PatchSpaceNoteOrganizationInput }
    | { kind: 'personal'; input: UpdateNoteInput };
};

export function buildAddNotesToFolderOperations(
  input: AddNotesToFolderInput,
): AddNotesToFolderOperation[] {
  const bucket = input.folderName.trim();
  if (!bucket) throw new Error('Folder name is required');
  const operations: AddNotesToFolderOperation[] = [];
  for (const row of input.rows) {
    const patch = computeNoteFolderAdditionPatch(
      {
        primaryCollection: row.primaryCollection ?? null,
        secondaryCollections: row.secondaryCollections ?? [],
        collectionPinned: row.collectionPinned,
        collectionUserOverride: row.collectionUserOverride,
      },
      bucket,
    );
    if (!patch) continue;
    operations.push({
      row,
      patch,
      request:
        input.spaceKind === 'shared'
          ? {
              kind: 'shared',
              input: {
                noteId: row.id,
                spaceId: input.spaceId,
                primaryCollection: patch.primaryCollection,
                secondaryCollections: patch.secondaryCollections,
              },
            }
          : {
              kind: 'personal',
              input: {
                // No title/content: this is a folder label change. `row` comes from a
                // list payload, whose content is truncated server-side — sending it
                // back would overwrite the note with its own preview.
                noteId: row.id,
                primaryCollection: patch.primaryCollection,
                secondaryCollections: patch.secondaryCollections,
                collectionUserOverride: patch.collectionUserOverride,
              },
            },
    });
  }
  return operations;
}

/** Add folder label to one or more notes (notes are kept; may move from Unsorted). */
export function useAddNotesToFolder() {
  const updateNote = useUpdateNote();
  const patchSpaceNoteOrganization = usePatchSpaceNoteOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddNotesToFolderInput) => {
      const bucket = input.folderName.trim();
      const operations = buildAddNotesToFolderOperations(input);
      if (operations.length === 0) {
        throw new Error('No notes were added to this folder');
      }

      /*
       * Personal notes go in one request.
       *
       * The fan-out below is one write per note against a 20/min per-endpoint limit, which
       * is why this action used to grey out past twenty selected while every other bulk
       * action allowed fifty. `assign-batch` does the same label maths server-side with the
       * same helper, so the cap could go.
       *
       * Shared spaces keep the fan-out: their labels live on `SpaceNotes`, not on the note,
       * and have their own per-note permission check.
       */
      const personal = operations.filter((op) => op.request.kind === 'personal');
      const shared = operations.filter((op) => op.request.kind === 'shared');

      if (personal.length > 0) {
        await api.post('/api/notes/folders/assign-batch', {
          noteIds: personal.map((op) => op.row.id),
          folderName: bucket,
        });
      }

      await Promise.all(
        shared.map(({ request }) =>
          request.kind === 'shared'
            ? patchSpaceNoteOrganization.mutateAsync(request.input)
            : updateNote.mutateAsync(request.input),
        ),
      );

      const sid = normalizePrototypeApiSpaceId(input.spaceId);
      if (sid) {
        try {
          await api.post(`/api/spaces/${encodeURIComponent(sid)}/folder-registry/remove-label`, {
            folderName: bucket,
          });
        } catch {
          // Non-fatal — notes now carry the label.
        }
      }

      return { addedCount: operations.length, operations };
    },
    onSuccess: (data, variables) => {
      const bucket = variables.folderName.trim();
      for (const { row, patch } of data.operations) {
        updateSpaceNoteInCache(queryClient, variables.spaceId, row.id, {
          primaryCollection: patch.primaryCollection,
          secondaryCollections: patch.secondaryCollections,
          ...(variables.spaceKind === 'personal'
            ? { collectionUserOverride: patch.collectionUserOverride }
            : {}),
        });
      }
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: prototypeFolderRegistryQueryKey(sid) });
      invalidatePrototypeSpaceDerivedQueries(queryClient, variables.spaceId);
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
    },
  });
}
