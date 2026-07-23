import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type BuiltInNoteTemplate = {
  id: string;
  name: string;
  description?: string;
  estimatedMinutes?: string;
  level?: string;
  title: string;
  content: string;
  noteType: string;
  source: 'builtIn';
};

export type StoredNoteTemplate = {
  id: string;
  userId: string;
  spaceId: string | null;
  orgId: string | null;
  name: string;
  title: string | null;
  content: string;
  noteType: string | null;
  createdAt: string | Date;
  updatedAt: string | Date | null;
  source: 'stored';
};

export type NoteTemplatesListResponse = {
  builtIn: BuiltInNoteTemplate[];
  personal: StoredNoteTemplate[];
  space?: StoredNoteTemplate[];
};

export type ApplyableNoteTemplate = {
  id: string;
  name: string;
  title: string;
  content: string;
  noteType: string;
  section: 'builtIn' | 'personal' | 'space';
};

export function noteTemplatesQueryKey(spaceId?: string | null) {
  return ['note-templates', spaceId ?? null] as const;
}

export function useNoteTemplates(spaceId?: string | null, enabled = true) {
  const sid = spaceId?.trim() || null;
  return useQuery({
    queryKey: noteTemplatesQueryKey(sid),
    queryFn: () =>
      api.get<NoteTemplatesListResponse>(
        '/api/note-templates/list',
        sid ? { spaceId: sid } : undefined,
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function flattenNoteTemplatesForPicker(
  data: NoteTemplatesListResponse | undefined,
): ApplyableNoteTemplate[] {
  if (!data) return [];
  const builtIn = data.builtIn.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title ?? '',
    content: t.content,
    noteType: t.noteType || 'default',
    section: 'builtIn' as const,
  }));
  const personal = data.personal.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title ?? '',
    content: t.content,
    noteType: t.noteType || 'default',
    section: 'personal' as const,
  }));
  const space = (data.space ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title ?? '',
    content: t.content,
    noteType: t.noteType || 'default',
    section: 'space' as const,
  }));
  return [...builtIn, ...personal, ...space];
}
