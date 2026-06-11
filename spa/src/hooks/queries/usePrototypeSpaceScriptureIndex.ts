import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';

export interface ScriptureIndexNoteBrief {
  id: string;
  title: string | null;
  updatedAt: string | null;
  createdAt: string;
}

export interface ScriptureIndexPassage {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  referenceCount: number;
  noteCount: number;
  notes: ScriptureIndexNoteBrief[];
}

export interface ScriptureIndexBook {
  bookOrder: number;
  title: string;
  referenceCount: number;
  noteCount: number;
  passages: ScriptureIndexPassage[];
}

export interface SpaceScriptureIndexResponse {
  success: boolean;
  books: ScriptureIndexBook[];
}

export function usePrototypeSpaceScriptureIndex(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'scripture-index'],
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<SpaceScriptureIndexResponse>(
        `/api/spaces/${encodeURIComponent(id!)}/scripture-index`,
      );
      return res.books ?? [];
    },
  });
}
