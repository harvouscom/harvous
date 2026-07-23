import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { noteTemplatesQueryKey, type StoredNoteTemplate } from '../queries/useNoteTemplates';

export interface CreateNoteTemplateBody {
  name: string;
  title?: string | null;
  content: string;
  noteType?: string | null;
  spaceId?: string | null;
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
        title: body.title ?? null,
        content: body.content,
        noteType: body.noteType ?? null,
        ...(body.spaceId ? { spaceId: body.spaceId } : {}),
      }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['note-templates'] });
      if (vars.spaceId) {
        void queryClient.invalidateQueries({ queryKey: noteTemplatesQueryKey(vars.spaceId) });
      }
      void queryClient.invalidateQueries({ queryKey: noteTemplatesQueryKey(null) });
    },
  });
}
