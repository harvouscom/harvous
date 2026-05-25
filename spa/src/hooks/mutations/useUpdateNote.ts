import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

interface UpdateNoteInput {
  noteId: string;
  title: string;
  content: string;
  primaryCollection?: string | null;
  secondaryCollections?: string[];
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
}

interface UpdateNoteResponse {
  success: boolean;
  note?: {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
  };
  scriptureResults?: unknown;
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
      const { noteId, title, content, primaryCollection, secondaryCollections, collectionPinned, collectionUserOverride } = input;
      const body: Record<string, unknown> = { noteId, title, content };
      if (primaryCollection !== undefined) body.primaryCollection = primaryCollection;
      if (secondaryCollections !== undefined) body.secondaryCollections = secondaryCollections;
      if (collectionPinned !== undefined) body.collectionPinned = collectionPinned;
      if (collectionUserOverride !== undefined) body.collectionUserOverride = collectionUserOverride;
      return api.put<UpdateNoteResponse>('/api/notes/update', body as any);
    },
    onSuccess: (_data, variables) => {
      // Optimistically patch the note detail cache so navigating back / refreshing
      // immediately shows the typed content without waiting for the refetch to
      // round-trip. Without this, a fast refresh after typing can briefly show
      // pre-save content, which reads as "save didn't persist."
      queryClient.setQueryData<Record<string, unknown> | undefined>(
        ['note', variables.noteId],
        (prev) => {
          if (!prev || typeof prev !== 'object') return prev;
          return {
            ...prev,
            title: variables.title,
            content: variables.content,
            ...(variables.primaryCollection !== undefined ? { primaryCollection: variables.primaryCollection } : {}),
            ...(variables.secondaryCollections !== undefined ? { secondaryCollections: variables.secondaryCollections } : {}),
            ...(variables.collectionPinned !== undefined ? { collectionPinned: variables.collectionPinned } : {}),
            ...(variables.collectionUserOverride !== undefined ? { collectionUserOverride: variables.collectionUserOverride } : {}),
          };
        },
      );
      // Note detail cache (used by editor when re-mounting / navigating back).
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      // List/sidebar caches — without these the sidebar shows the old title
      // ("New Note") indefinitely after a save, which the user perceives as
      // "saves aren't working." `useCreateSimpleNote` already invalidates these
      // on create; `useUpdateNote` needs to mirror that on every save.
      queryClient.invalidateQueries({ queryKey: ['space'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
      window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: variables.noteId } }));
    },
  });
}
