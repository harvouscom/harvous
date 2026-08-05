import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  invalidateChurchStarterConsumers,
  invalidateNoteTemplatesQueries,
  syncStoredNoteTemplateInCaches,
  type StoredNoteTemplate,
} from '../queries/useNoteTemplates';

export interface UpdateNoteTemplateBody {
  id: string;
  name: string;
  description?: string | null;
  /** When non-empty, refreshes stored title/content/noteType from the open note. */
  title?: string | null;
  content?: string | null;
  noteType?: string | null;
  /** Pass null to detach from a space; omit to leave spaceId unchanged. */
  spaceId?: string | null;
  iconColor?: string | null;
}

interface UpdateNoteTemplateResponse {
  success: boolean;
  template: StoredNoteTemplate;
}

export function useUpdateNoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateNoteTemplateBody) =>
      api.post<UpdateNoteTemplateResponse>('/api/note-templates/update', {
        id: body.id,
        name: body.name,
        description: body.description ?? null,
        iconColor: body.iconColor ?? null,
        ...(body.content != null && String(body.content).trim()
          ? {
              title: body.title ?? null,
              content: body.content,
              noteType: body.noteType ?? null,
            }
          : {}),
        ...('spaceId' in body ? { spaceId: body.spaceId ?? null } : {}),
      }),
    onSuccess: (data) => {
      syncStoredNoteTemplateInCaches(queryClient, data.template);
      void invalidateNoteTemplatesQueries(queryClient);
      if (data.template.orgId) void invalidateChurchStarterConsumers(queryClient);
    },
  });
}
