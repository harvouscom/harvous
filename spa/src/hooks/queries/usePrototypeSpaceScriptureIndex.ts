import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';
import { saveScriptureIndexLocal } from '@/utils/offline-scripture-index';

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
  const { userId } = useAuth();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'scripture-index'],
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<SpaceScriptureIndexResponse>(
        `/api/spaces/${encodeURIComponent(id!)}/scripture-index`,
      );
      const books = res.books ?? [];
      /**
       * Mirror on the way past, so the reader's margin markers survive offline.
       *
       * Written here rather than in the reader's hook so that *any* consumer refreshes it —
       * the sidebar's Scripture mode reads this index far more often than the reader does,
       * and note mutations already invalidate this key
       * (`invalidatePrototypeSpaceDerivedQueries`). That is what makes the mirror refresh on
       * note change rather than on chapter open.
       */
      if (userId && id) void saveScriptureIndexLocal(userId, id, books);
      return books;
    },
  });
}
