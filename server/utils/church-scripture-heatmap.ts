/**
 * Where a church has been dwelling — the passages it has actually taught.
 *
 * Built from `ChurchServices.reference`: the church's own plan and the plans of
 * its rooms. That is staff's own record of what they taught, which is why this
 * can be a plain aggregate with no privacy machinery around it.
 *
 * **Deliberately NOT built from congregants' notes.** Aggregating what the
 * congregation wrote about would be the first church-facing read of note
 * content, and this codebase refuses that in several places by name — the
 * teaching-plan helpers keep note lineage scoped to one viewer, and Engagement
 * is "how many, never who". A pastor learning that Romans 8 is where their
 * church writes most is a different product decision from a pastor seeing what
 * they themselves have preached, and it is not this one. The seam exists if
 * that decision is ever taken deliberately; nothing here reaches for it.
 *
 * Counts a reference once per planned week. A series that spends four Sundays
 * in Romans 8 counts four, because that is four weeks of the church's
 * attention — the unit is the gathering, not the verse.
 */

import { db, ChurchServices, Spaces, eq, and, isNotNull, or, isNull } from '../db';
import { parseScriptureReference } from '../../src/utils/scripture-detector';

export type HeatmapBook = {
  book: string;
  /** Planned weeks that named this book. */
  count: number;
  /** Chapter → weeks, for the drilled-into view. */
  chapters: Record<number, number>;
};

export type ScriptureHeatmap = {
  /** Descending by count, then alphabetical so ties are stable across reloads. */
  books: HeatmapBook[];
  /** Weeks that named a passage at all — the denominator worth showing. */
  totalPlanned: number;
  /** Weeks whose passage could not be parsed; surfaced rather than hidden. */
  unparsed: number;
};

/**
 * Fold a list of planned references into per-book and per-chapter counts.
 *
 * Pure, so the shape can be tested without a church. A cross-chapter range
 * counts each chapter it spans once: "Romans 8:1-9:5" is a week in both.
 *
 * Book and chapter come from the shared detector and nowhere else. It has no
 * chapter-range form — "Romans 8-9" reads as chapter 8 expanded to its whole
 * verse range — so that week lands in one chapter rather than two. Left as the
 * parser sees it on purpose: one parser decides what a reference means across
 * the app, and a second opinion living here would drift from the pills.
 */
export function foldReferencesIntoHeatmap(references: Array<string | null>): ScriptureHeatmap {
  const byBook = new Map<string, { count: number; chapters: Map<number, number> }>();
  let totalPlanned = 0;
  let unparsed = 0;

  for (const raw of references) {
    const reference = raw?.trim();
    if (!reference) continue;
    totalPlanned += 1;

    const parsed = parseScriptureReference(reference);
    if (!parsed?.book) {
      unparsed += 1;
      continue;
    }

    const entry = byBook.get(parsed.book) ?? { count: 0, chapters: new Map<number, number>() };
    entry.count += 1;

    const first = parsed.chapter;
    const last = parsed.endChapter && parsed.endChapter >= first ? parsed.endChapter : first;
    for (let chapter = first; chapter <= last; chapter += 1) {
      entry.chapters.set(chapter, (entry.chapters.get(chapter) ?? 0) + 1);
    }
    byBook.set(parsed.book, entry);
  }

  const books = [...byBook.entries()]
    .map(([book, entry]) => ({
      book,
      count: entry.count,
      chapters: Object.fromEntries(entry.chapters),
    }))
    .sort((a, b) => b.count - a.count || a.book.localeCompare(b.book));

  return { books, totalPlanned, unparsed };
}

/**
 * Every passage this church has planned — its own plan plus its rooms'.
 *
 * Scoped by `churchId` and, for space rows, re-checked against the space's
 * `orgId`: a plan row's space must belong to the same church, and deriving the
 * scope from the join rather than trusting `ChurchServices.churchId` alone
 * keeps a mis-filed row from leaking one church's teaching into another's.
 */
export async function loadChurchPlannedReferences(
  churchId: string,
  orgId: string,
): Promise<Array<string | null>> {
  const rows = await db
    .select({ reference: ChurchServices.reference })
    .from(ChurchServices)
    .leftJoin(Spaces, eq(Spaces.id, ChurchServices.spaceId))
    .where(
      and(
        eq(ChurchServices.churchId, churchId),
        isNotNull(ChurchServices.reference),
        // Church-plan rows have no space; space-plan rows must be this org's.
        or(isNull(ChurchServices.spaceId), eq(Spaces.orgId, orgId)),
      ),
    );
  return rows.map((row) => row.reference);
}

export async function buildChurchScriptureHeatmap(
  churchId: string,
  orgId: string,
): Promise<ScriptureHeatmap> {
  return foldReferencesIntoHeatmap(await loadChurchPlannedReferences(churchId, orgId));
}
