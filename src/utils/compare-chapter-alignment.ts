/**
 * Two translations of one chapter, laid beside each other row by row.
 *
 * ## Why verse numbers, and why gaps are shown rather than closed
 *
 * Translations do not agree on how many verses a chapter has. KJV counts 31,102 in the Bible
 * and MSG about 31,015, and the difference is not spread evenly — it lands as whole verses that
 * one version has and another does not, usually where the manuscript tradition differs. Any
 * alignment that quietly closed those gaps would slide one column against the other for the rest
 * of the chapter, so verse 12 on the left would sit beside verse 11 on the right and the
 * comparison would be silently wrong from there down.
 *
 * So the row *is* the verse number, and a version that lacks it gets an empty cell that says so.
 * This is what a printed parallel Bible does, and it is the only arrangement where "verse 7
 * beside verse 7" is true on every row rather than most of them.
 *
 * ## What this deliberately does not attempt
 *
 * Merged verses. Some translations render "4-5" as one unit, which arrives here as a single
 * entry under one of the two numbers; the other number then reads as missing. Presenting that
 * honestly needs a verse-span model the chapter payload does not carry, and inventing one from
 * the text would be guessing at where a translator joined two thoughts.
 */

/** One verse as the chapter endpoint returns it. */
export type ComparableVerse = { number: number; text: string };

export type ComparedRow = {
  verse: number;
  /** `null` where this side's translation has no verse with this number. */
  left: string | null;
  right: string | null;
};

function byNumber(verses: readonly ComparableVerse[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const v of verses) {
    /*
     * First write wins, and only for numbers that are actually verse numbers. A payload with a
     * repeated number is malformed rather than meaningful, and taking the later one would show
     * the second half of a duplicated verse with no sign that the first existed.
     */
    if (!Number.isInteger(v?.number) || v.number < 1) continue;
    if (map.has(v.number)) continue;
    map.set(v.number, v.text);
  }
  return map;
}

/**
 * The union of both sides' verse numbers, ascending, each with whatever text exists for it.
 *
 * Ascending by number rather than by either side's array order: the two arrays are the same
 * chapter and should already agree on order, and sorting means a payload that does not cannot
 * put the columns out of step.
 */
export function alignChapterVerses(
  left: readonly ComparableVerse[],
  right: readonly ComparableVerse[],
): ComparedRow[] {
  const l = byNumber(left);
  const r = byNumber(right);
  const numbers = [...new Set([...l.keys(), ...r.keys()])].sort((a, b) => a - b);
  return numbers.map((verse) => ({
    verse,
    left: l.get(verse) ?? null,
    right: r.get(verse) ?? null,
  }));
}

/**
 * Whether a chapter differs enough between two translations to be worth saying so.
 *
 * Not a warning — a reader comparing versions is there precisely to see where they differ. It
 * exists so the surface can name the reason a row is empty ("not in MSG") rather than leaving a
 * blank cell to be read as a loading state.
 */
export function missingVerseCount(rows: readonly ComparedRow[]): { left: number; right: number } {
  let leftMissing = 0;
  let rightMissing = 0;
  for (const row of rows) {
    if (row.left == null) leftMissing += 1;
    if (row.right == null) rightMissing += 1;
  }
  return { left: leftMissing, right: rightMissing };
}
