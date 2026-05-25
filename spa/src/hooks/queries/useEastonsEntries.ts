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

interface IndexResponse {
  success: boolean;
  entries: EastonsSlugEntry[];
}

interface EntryResponse extends EastonsDictionaryEntry {
  success: boolean;
}

/** All slug entries for the dictionary list view (alphabetical by headword). */
export function useEastonsEntryList() {
  return useQuery({
    queryKey: ['dictionary', 'eastons', 'list'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const res = await api.get<IndexResponse>('/api/dictionary/eastons/index');
      const entries = res.entries ?? [];
      return [...entries].sort((a, b) =>
        a.headword.localeCompare(b.headword, undefined, { sensitivity: 'base' }),
      );
    },
  });
}

/** Single entry fetched by slug. */
export function useEastonsEntry(slug: string | undefined) {
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
