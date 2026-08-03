import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type BuiltInNoteTemplate = {
  id: string;
  name: string;
  description?: string;
  estimatedMinutes?: string;
  level?: string;
  title: string;
  content: string;
  noteType: string;
  iconColor?: string | null;
  source: 'builtIn';
};

export type StoredNoteTemplate = {
  id: string;
  userId: string;
  spaceId: string | null;
  orgId: string | null;
  name: string;
  description?: string | null;
  title: string | null;
  content: string;
  noteType: string | null;
  iconColor?: string | null;
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
  iconColor?: string | null;
};

export function noteTemplatesQueryKey(spaceId?: string | null) {
  return ['note-templates', spaceId ?? null] as const;
}

/** Mark every templates list stale and refetch — including inactive browse sheets. */
export function invalidateNoteTemplatesQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: ['note-templates'],
    refetchType: 'all',
  });
}

/**
 * Patch cached list responses after create/update so Browse reflects changes without a reload.
 * Handles personal ↔ space moves when `spaceId` changes.
 */
export function syncStoredNoteTemplateInCaches(
  queryClient: QueryClient,
  template: StoredNoteTemplate,
) {
  const next: StoredNoteTemplate = { ...template, source: 'stored' };
  queryClient.setQueriesData<NoteTemplatesListResponse>({ queryKey: ['note-templates'] }, (old) => {
    if (!old) return old;
    const id = next.id;
    const personalWithout = old.personal.filter((t) => t.id !== id);
    const spaceWithout = (old.space ?? []).filter((t) => t.id !== id);

    if (next.spaceId) {
      const space =
        old.space !== undefined
          ? (() => {
              const idx = (old.space ?? []).findIndex((t) => t.id === id);
              if (idx === -1) return [next, ...spaceWithout];
              const copy = [...(old.space ?? [])];
              copy[idx] = next;
              return copy;
            })()
          : old.space;
      return {
        ...old,
        personal: personalWithout,
        ...(old.space !== undefined ? { space: space ?? [] } : {}),
      };
    }

    const personalIdx = old.personal.findIndex((t) => t.id === id);
    const personal =
      personalIdx === -1
        ? [next, ...personalWithout]
        : old.personal.map((t) => (t.id === id ? next : t));
    return {
      ...old,
      personal,
      ...(old.space !== undefined ? { space: spaceWithout } : {}),
    };
  });
}

export function removeStoredNoteTemplateFromCaches(queryClient: QueryClient, id: string) {
  queryClient.setQueriesData<NoteTemplatesListResponse>({ queryKey: ['note-templates'] }, (old) => {
    if (!old) return old;
    return {
      ...old,
      personal: old.personal.filter((t) => t.id !== id),
      ...(old.space !== undefined
        ? { space: (old.space ?? []).filter((t) => t.id !== id) }
        : {}),
    };
  });
}

export function useNoteTemplates(spaceId?: string | null, enabled = true) {
  const authReady = useAuthReady();
  const sid = spaceId?.trim() || null;
  return useQuery({
    queryKey: noteTemplatesQueryKey(sid),
    queryFn: () =>
      api.get<NoteTemplatesListResponse>(
        '/api/note-templates/list',
        sid ? { spaceId: sid } : undefined,
      ),
    enabled: authReady && enabled,
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
    iconColor: t.iconColor ?? null,
  }));
  const personal = data.personal.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title ?? '',
    content: t.content,
    noteType: t.noteType || 'default',
    section: 'personal' as const,
    iconColor: t.iconColor ?? null,
  }));
  const space = (data.space ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title ?? '',
    content: t.content,
    noteType: t.noteType || 'default',
    section: 'space' as const,
    iconColor: t.iconColor ?? null,
  }));
  return [...builtIn, ...personal, ...space];
}
