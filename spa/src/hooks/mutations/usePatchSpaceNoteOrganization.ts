import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  restoreSpaceNotesCaches,
  snapshotSpaceNotesCaches,
  spaceNotesQueryKey,
  updateSpaceNoteInCache,
  type SpaceNotesPage,
} from '../../lib/space-notes-cache';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { NoteDetail } from '../queries/useNote';

export type SpaceNoteOrganizationPatch = {
  isPinned?: boolean;
  primaryCollection?: string | null;
  secondaryCollections?: string[];
  collectionPinned?: boolean;
  order?: number;
};

export type NoteCollectionExtras = {
  primaryCollection?: string | null;
  secondaryCollections?: string[];
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
};

export function spaceNoteOrganizationPatchFromCollectionExtras(
  extras?: NoteCollectionExtras,
): SpaceNoteOrganizationPatch {
  if (!extras) return {};
  return {
    ...(extras.primaryCollection !== undefined
      ? { primaryCollection: extras.primaryCollection }
      : {}),
    ...(extras.secondaryCollections !== undefined
      ? { secondaryCollections: extras.secondaryCollections }
      : {}),
    ...(extras.collectionPinned !== undefined
      ? { collectionPinned: extras.collectionPinned }
      : {}),
  };
}

export type PatchSpaceNoteOrganizationInput = SpaceNoteOrganizationPatch & {
  spaceId: string;
  noteId: string;
};

type SpaceNoteOrganization = {
  isPinned: boolean;
  primaryCollection: string | null;
  secondaryCollections: string[];
  collectionPinned: boolean;
  order: number;
};

type PatchSpaceNoteOrganizationResponse = {
  success: boolean;
  noteId: string;
  contextSpaceId: string;
  organization: SpaceNoteOrganization;
};

export function buildPatchSpaceNoteOrganizationRequest(
  input: PatchSpaceNoteOrganizationInput,
): {
  spaceId: string;
  url: string;
  body: SpaceNoteOrganizationPatch;
} {
  const spaceId = normalizePrototypeApiSpaceId(input.spaceId);
  if (!spaceId) throw new Error('A shared space is required to organize this note.');
  const {
    noteId,
    spaceId: _spaceId,
    isPinned,
    primaryCollection,
    secondaryCollections,
    collectionPinned,
    order,
  } = input;
  return {
    spaceId,
    url: `/api/spaces/${encodeURIComponent(spaceId)}/notes/${encodeURIComponent(noteId)}`,
    body: {
      ...(isPinned !== undefined ? { isPinned } : {}),
      ...(primaryCollection !== undefined ? { primaryCollection } : {}),
      ...(secondaryCollections !== undefined ? { secondaryCollections } : {}),
      ...(collectionPinned !== undefined ? { collectionPinned } : {}),
      ...(order !== undefined ? { order } : {}),
    },
  };
}

export function patchContextualNoteOrganization(
  note: NoteDetail,
  patch: SpaceNoteOrganizationPatch,
): NoteDetail {
  const current = note.organization ?? {
    isPinned: false,
    primaryCollection: note.primaryCollection ?? null,
    secondaryCollections: note.secondaryCollections ?? [],
    collectionPinned: note.collectionPinned ?? false,
    order: 0,
  };
  const organization = { ...current, ...patch };
  return {
    ...note,
    organization,
    primaryCollection: organization.primaryCollection,
    secondaryCollections: organization.secondaryCollections,
    collectionPinned: organization.collectionPinned,
  };
}

export function usePatchSpaceNoteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PatchSpaceNoteOrganizationInput) => {
      const request = buildPatchSpaceNoteOrganizationRequest(input);
      return api.patch<PatchSpaceNoteOrganizationResponse>(request.url, request.body);
    },
    onMutate: async (input) => {
      const request = buildPatchSpaceNoteOrganizationRequest(input);
      const noteKey = ['note', input.noteId, request.spaceId] as const;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: noteKey }),
        queryClient.cancelQueries({ queryKey: spaceNotesQueryKey(request.spaceId) }),
      ]);
      const previousNote = queryClient.getQueryData<NoteDetail>(noteKey);
      const previousList = snapshotSpaceNotesCaches(queryClient, request.spaceId);
      queryClient.setQueryData<NoteDetail>(
        noteKey,
        (note) => note ? patchContextualNoteOrganization(note, request.body) : note,
      );
      updateSpaceNoteInCache(queryClient, request.spaceId, input.noteId, {
        ...(request.body.isPinned !== undefined
          ? { isPinned: request.body.isPinned }
          : {}),
        ...(request.body.primaryCollection !== undefined
          ? { primaryCollection: request.body.primaryCollection }
          : {}),
        ...(request.body.secondaryCollections !== undefined
          ? { secondaryCollections: request.body.secondaryCollections }
          : {}),
        ...(request.body.collectionPinned !== undefined
          ? { collectionPinned: request.body.collectionPinned }
          : {}),
      });
      return { noteKey, previousNote, previousList, spaceId: request.spaceId };
    },
    onError: (_error, _input, context) => {
      if (!context) return;
      queryClient.setQueryData(context.noteKey, context.previousNote);
      restoreSpaceNotesCaches(queryClient, context.previousList);
    },
    onSuccess: (response, input) => {
      const spaceId = normalizePrototypeApiSpaceId(response.contextSpaceId ?? input.spaceId);
      if (!spaceId) return;
      const noteKey = ['note', input.noteId, spaceId] as const;
      queryClient.setQueryData<NoteDetail>(
        noteKey,
        (note) =>
          note
            ? patchContextualNoteOrganization(note, response.organization)
            : note,
      );
      updateSpaceNoteInCache(queryClient, spaceId, input.noteId, {
        isPinned: response.organization.isPinned,
        primaryCollection: response.organization.primaryCollection,
        secondaryCollections: response.organization.secondaryCollections,
        collectionPinned: response.organization.collectionPinned,
      });
      queryClient.invalidateQueries({ queryKey: noteKey, refetchType: 'inactive' });
      queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'bootstrap'] });
      invalidatePrototypeSpaceDerivedQueries(queryClient, spaceId);
    },
  });
}
