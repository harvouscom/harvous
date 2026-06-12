import Fuse from 'fuse.js/basic';

const FUZZY_OPTIONS = {
  threshold: 0.4,
  ignoreLocation: true,
} as const;

export function fuzzyFilter<T>(items: T[], keys: string[], query: string): T[] {
  const trimmed = query.trim();
  if (!trimmed || items.length === 0) return items;
  const fuse = new Fuse(items, { ...FUZZY_OPTIONS, keys });
  return fuse.search(trimmed).map((result) => result.item);
}

export function fuzzyMatches(query: string, ...texts: (string | null | undefined)[]): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const haystack = texts.filter(Boolean).join(' ');
  if (!haystack) return false;
  const fuse = new Fuse([{ text: haystack }], { ...FUZZY_OPTIONS, keys: ['text'] });
  return fuse.search(trimmed).length > 0;
}
