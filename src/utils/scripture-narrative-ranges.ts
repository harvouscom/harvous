/**
 * Canonical-range guard for narrative / structural subjects.
 *
 * The AI subject author (claude-opus-4-8) is reliable on thematic subjects but occasionally stamps
 * an event-specific *narrative* subject onto a merely thematically-adjacent chapter — e.g.
 * "The Passion" on Amos 6, "The Exile" on Acts 2 (Pentecost), "The Prophets" on Exodus 37.
 * Theologian review (2026-06) found these misfires cluster entirely in the narrative category.
 *
 * This guard is the deterministic fix. Each gated narrative subject is bound to the chapter ranges
 * where its event actually occurs:
 *   - present but out of range  → removed
 *   - in range but missing, and the event is the chapter's headline (`inject: true`) → added
 * Thematic subjects (Faith, Grace, Repentance…) are never gated. Build-time only — applied when
 * `import-subjects.ts` assembles the client index; not shipped to the client.
 */

/** [book, startChapter, endChapter] — inclusive; a single chapter is [book, n, n]. */
type Range = readonly [book: string, startChapter: number, endChapter: number];
interface GuardRule {
  /** When true, add this subject (as the leading/headline subject) to in-range chapters that lack it. */
  inject: boolean;
  ranges: readonly Range[];
}

/**
 * Only subjects listed here are gated; everything else passes through untouched. `inject: true` is
 * reserved for tight, unambiguous events that are the headline of every chapter in range. The
 * broad/eschatological subjects are filter-only — we remove obvious misfires but never auto-add.
 */
const RANGES: Record<string, GuardRule> = {
  Creation: { inject: true, ranges: [['Genesis', 1, 2]] },
  'The Fall': { inject: true, ranges: [['Genesis', 3, 3]] },
  'The Flood': { inject: true, ranges: [['Genesis', 6, 9]] },
  'The Exodus': { inject: true, ranges: [['Exodus', 1, 15]] },
  'The Ten Commandments': { inject: true, ranges: [['Exodus', 20, 20], ['Deuteronomy', 5, 5]] },
  // Exclude the golden-calf interlude (Exodus 32–34) from the construction chapters.
  'The Tabernacle': { inject: true, ranges: [['Exodus', 25, 31], ['Exodus', 35, 40]] },
  'The Temple': {
    inject: true,
    ranges: [['1 Kings', 6, 8], ['1 Chronicles', 28, 29], ['2 Chronicles', 2, 7], ['Ezra', 3, 6]],
  },
  'Birth of Jesus': { inject: true, ranges: [['Matthew', 1, 2], ['Luke', 1, 2]] },
  'Sermon on the Mount': { inject: true, ranges: [['Matthew', 5, 7]] },
  'The Passion': {
    inject: true,
    ranges: [['Matthew', 26, 27], ['Mark', 14, 15], ['Luke', 22, 23], ['John', 18, 19]],
  },
  'The Resurrection': {
    inject: true,
    ranges: [['Matthew', 28, 28], ['Mark', 16, 16], ['Luke', 24, 24], ['John', 20, 21], ['1 Corinthians', 15, 15]],
  },
  'The New Jerusalem': { inject: true, ranges: [['Revelation', 21, 22]] },

  // ── Filter-only (remove misfires; never auto-add) ────────────────────────────
  'The Early Church': { inject: false, ranges: [['Acts', 1, 28]] },
  'The Prophets': {
    inject: false,
    ranges: [
      ['1 Kings', 17, 22], ['2 Kings', 1, 13], ['Isaiah', 1, 66], ['Jeremiah', 1, 52], ['Lamentations', 1, 5],
      ['Ezekiel', 1, 48], ['Daniel', 1, 12], ['Hosea', 1, 14], ['Joel', 1, 3], ['Amos', 1, 9], ['Obadiah', 1, 1],
      ['Jonah', 1, 4], ['Micah', 1, 7], ['Nahum', 1, 3], ['Habakkuk', 1, 3], ['Zephaniah', 1, 3], ['Haggai', 1, 2],
      ['Zechariah', 1, 14], ['Malachi', 1, 4],
    ],
  },
  'The Day of the Lord': {
    inject: false,
    ranges: [
      ['Isaiah', 1, 66], ['Jeremiah', 1, 52], ['Ezekiel', 1, 48], ['Joel', 1, 3], ['Amos', 1, 9], ['Obadiah', 1, 1],
      ['Micah', 1, 7], ['Zephaniah', 1, 3], ['Haggai', 1, 2], ['Zechariah', 1, 14], ['Malachi', 1, 4],
      ['Matthew', 24, 25], ['Mark', 13, 13], ['Luke', 21, 21], ['1 Thessalonians', 4, 5], ['2 Thessalonians', 1, 2],
      ['2 Peter', 3, 3], ['Revelation', 1, 22],
    ],
  },
  'The Exile': {
    inject: false,
    ranges: [
      ['2 Kings', 17, 17], ['2 Kings', 24, 25], ['2 Chronicles', 36, 36], ['Ezra', 1, 1], ['Nehemiah', 1, 1],
      ['Lamentations', 1, 5], ['Jeremiah', 25, 52], ['Ezekiel', 1, 39], ['Daniel', 1, 9],
    ],
  },
};

function inRange(ranges: readonly Range[], book: string, chapter: number): boolean {
  return ranges.some(([b, start, end]) => b === book && chapter >= start && chapter <= end);
}

/**
 * Apply the canonical-range guard to one chapter's subjects: drop gated narrative subjects that
 * don't belong here, then lead with any in-range headline events that were missing. Order is
 * otherwise preserved; thematic subjects pass through. (Caller slices to its display cap.)
 */
export function guardNarrativeSubjects(book: string, chapter: number, subjects: string[]): string[] {
  const kept = subjects.filter((s) => {
    const rule = RANGES[s];
    return !rule || inRange(rule.ranges, book, chapter);
  });
  const present = new Set(kept.map((s) => s.toLowerCase()));
  const injected: string[] = [];
  for (const [name, rule] of Object.entries(RANGES)) {
    if (rule.inject && !present.has(name.toLowerCase()) && inRange(rule.ranges, book, chapter)) {
      injected.push(name);
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...injected, ...kept]) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}
