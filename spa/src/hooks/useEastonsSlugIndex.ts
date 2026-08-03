import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type EastonCategory = 'person' | 'place' | 'thing';

interface SlugEntry {
  slug: string;
  headword: string;
  category: EastonCategory;
}

interface IndexResponse {
  success: boolean;
  entries: SlugEntry[];
}

// Module-level cache so the Set survives re-renders without a ref.
let cachedIndex: Map<string, SlugEntry> | null = null;

function buildIndex(entries: SlugEntry[]): Map<string, SlugEntry> {
  const m = new Map<string, SlugEntry>();
  for (const e of entries) {
    m.set(e.slug, e);
  }
  return m;
}

/** Normalize a word to the slug form used in the index. Tries exact → lowercase → drop trailing s/es/'s. */
export function normalizeToSlug(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\w-]/g, '')   // strip punctuation
    .replace(/[_]/g, '-');    // underscores → hyphens
}

/** Returns slug candidates to try for a given word, ordered from most to least specific. */
export function slugCandidates(word: string): string[] {
  const base = normalizeToSlug(word);
  const candidates = [base];
  if (base.endsWith("'s")) candidates.push(base.slice(0, -2));
  if (base.endsWith('ies')) candidates.push(base.slice(0, -3) + 'y');
  if (base.endsWith('es')) candidates.push(base.slice(0, -2));
  if (base.endsWith('s') && !base.endsWith('ss')) candidates.push(base.slice(0, -1));
  return [...new Set(candidates)];
}

export function useEastonsSlugIndex() {
  // auth-gate-exempt: /api/dictionary/eastons/index is unauthenticated static
  // public-domain reference data (server/routes/dictionary.ts) — no session needed.
  return useQuery({
    queryKey: ['dictionary', 'eastons', 'index'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const res = await api.get<IndexResponse>('/api/dictionary/eastons/index');
      const index = buildIndex(res.entries ?? []);
      cachedIndex = index;
      return index;
    },
    initialData: cachedIndex ?? undefined,
  });
}

/** Synchronous lookup into the cached index — returns the entry if the word (or a lemma of it) is found. */
export function lookupWord(word: string, index: Map<string, SlugEntry> | undefined): SlugEntry | null {
  if (!index) return null;
  for (const slug of slugCandidates(word)) {
    const entry = index.get(slug);
    if (entry) return entry;
  }
  return null;
}
