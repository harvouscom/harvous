/**
 * Conceptual overlap for bible-study keywords — shared by folder assignment and auto-tags.
 * Keep in sync with native `BibleStudyTagSuggester.overlaps()` (Swift).
 */

const CONCEPT_OVERLAP_PAIRS: [string, string][] = [
  ['goodness', 'righteousness'],
  ['grace', 'mercy'],
  ['love', 'mercy'],
  ['faith', 'belief'],
  ['hope', 'faith'],
  ['peace', 'joy'],
  ['kingdom of god', 'heaven'],
  ['resurrection', 'eternal life'],
  ['eternal life', 'everlasting life'],
  ['holy spirit', 'spirit'],
  ['jesus', 'christ'],
  ['god', 'father'],
  ['god', 'lord'],
  ['prayer', 'intercession'],
  ['thanksgiving', 'thankfulness'],
  ['salvation', 'redemption'],
  ['cross', 'atonement'],
  ['gospel', 'mission'],
  ['mission', 'evangelism'],
  ['discipleship', 'spiritual growth'],
  ['sanctification', 'holiness'],
  ['grief', 'lament'],
  ['fear', 'anxiety'],
  ['healing', 'restoration'],
  ['deliverance', 'salvation'],
  ['reconciliation', 'forgiveness'],
  ['church', 'body of christ'],
  ['second coming', 'return of christ'],
  ['stewardship', 'generosity'],
  ['contentment', 'rest'],
  ['wisdom', 'discernment'],
  ['sin', 'temptation'],
  ['idolatry', 'false gods'],
  ['trust', 'faith'],
  ['justice', 'mercy'],
];

/** True when two labels represent the same or adjacent concept (native `overlaps()` parity). */
export function conceptOverlaps(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  for (const [p, q] of CONCEPT_OVERLAP_PAIRS) {
    if ((x === p && y === q) || (x === q && y === p)) return true;
  }
  return false;
}

/** True when `name` matches or concept-overlaps any label in `labels`. */
export function conceptOverlapsAny(name: string, labels: string[]): boolean {
  for (const label of labels) {
    if (conceptOverlaps(name, label)) return true;
  }
  return false;
}

/**
 * Drop lower-scoring rows when concepts overlap (native `picked` build).
 * Input should be pre-sorted by score descending for stable "keep best" behavior.
 */
export function dedupeKeywordRowsByConceptOverlap<T>(
  rows: T[],
  getName: (row: T) => string,
  getScore: (row: T) => number,
): T[] {
  const sorted = [...rows].sort((a, b) => getScore(b) - getScore(a));
  const picked: T[] = [];
  for (const row of sorted) {
    const name = getName(row);
    if (picked.some((existing) => conceptOverlaps(name, getName(existing)))) continue;
    if (picked.some((existing) => getName(existing).toLowerCase() === name.toLowerCase())) continue;
    picked.push(row);
  }
  return picked;
}

/** Primary + secondary folder labels used to exclude auto-tags. */
export function folderLabelsForTagExclusion(
  primary: string | null | undefined,
  secondaries: string[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = (raw ?? '').trim();
    if (!t.length) return;
    const low = t.toLowerCase();
    if (seen.has(low)) return;
    seen.add(low);
    out.push(t);
  };
  add(primary);
  for (const s of secondaries ?? []) add(s);
  return out;
}
