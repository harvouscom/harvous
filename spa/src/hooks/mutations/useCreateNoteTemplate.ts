import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  invalidateNoteTemplatesQueries,
  syncStoredNoteTemplateInCaches,
  type StoredNoteTemplate,
} from '../queries/useNoteTemplates';

export interface CreateNoteTemplateBody {
  name: string;
  /** Short list blurb (max ~2 lines in browse sheet). */
  description?: string | null;
  title?: string | null;
  content: string;
  noteType?: string | null;
  spaceId?: string | null;
  /** Thread accent for the list icon tile. */
  iconColor?: string | null;
}

interface CreateNoteTemplateResponse {
  success: boolean;
  template: StoredNoteTemplate;
}

export function useCreateNoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateNoteTemplateBody) =>
      api.post<CreateNoteTemplateResponse>('/api/note-templates/create', {
        name: body.name,
        description: body.description ?? null,
        title: body.title ?? null,
        content: body.content,
        noteType: body.noteType ?? null,
        iconColor: body.iconColor ?? null,
        ...(body.spaceId ? { spaceId: body.spaceId } : {}),
      }),
    onSuccess: (data) => {
      syncStoredNoteTemplateInCaches(queryClient, data.template);
      void invalidateNoteTemplatesQueries(queryClient);
    },
  });
}
