export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/** One chip per normalized tag name; preserves first-seen order. */
export function dedupeNoteTagsByName<T extends { id: string; name: string }>(tags: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const tag of tags) {
    const key = normalizeTagName(tag.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}
