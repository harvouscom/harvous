import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { EastonCategory } from '../useEastonsSlugIndex';

export interface EastonsSlugEntry {
  slug: string;
  headword: string;
  category: EastonCategory;
}

export interface EastonsDictionaryEntry {
  slug: string;
  headword: string;
  category: EastonCategory | null;
  body: string;
  seeAlso: string[];
}

interface EntryResponse extends EastonsDictionaryEntry {
  success: boolean;
}

/** Single entry fetched by slug. */
export function useEastonsEntry(slug: string | undefined) {
  // auth-gate-exempt: /api/dictionary/eastons/:slug is unauthenticated static
  // public-domain reference data (server/routes/dictionary.ts) — no session needed.
  return useQuery({
    queryKey: ['dictionary', 'eastons', 'entry', slug],
    enabled: !!slug,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const res = await api.get<EntryResponse>(`/api/dictionary/eastons/${slug}`);
      return {
        slug: res.slug,
        headword: res.headword,
        category: res.category ?? null,
        body: res.body,
        seeAlso: res.seeAlso ?? [],
      } as EastonsDictionaryEntry;
    },
  });
}

export function eastonsCategoryIconName(category: EastonCategory | null | undefined): string | null {
  switch (category) {
    case 'person':
      return 'person';
    case 'place':
      return 'location-dot';
    case 'thing':
      return 'shapes';
    default:
      return null;
  }
}
