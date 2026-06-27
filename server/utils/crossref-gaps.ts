/**
 * Cross-reference gaps: passages the Treasury of Scripture Knowledge links FROM a user's cited
 * passages that the user has NOT cited in any note or passage highlight. These are the "you studied X
 * but never the connected Y" prompts for the generative recall carousel. Deterministic, no AI.
 */

import { normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';
import {
  db,
  eq,
  and,
  or,
  gte,
  desc,
  isNotNull,
  Notes,
  ScriptureMetadata,
  ScriptureCrossReferences,
  StudyThreadEntries,
} from '../db';

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface CrossRefGap {
  from: VerseRef & { displayRef: string };
  to: VerseRef & { displayRef: string };
  votes: number;
}

const verseKey = (v: VerseRef) => `${v.book}|${v.chapter}|${v.verse}`;

function displayRef(v: VerseRef): string {
  return `${v.book} ${v.chapter}:${v.verse}`;
}

/** Expand a stored passage/highlight ref into per-verse keys (same-chapter ranges). Pure. */
export function verseKeysFromScriptureReference(reference: string): string[] {
  const normalized = normalizeScriptureReference(reference.trim()) ?? reference.trim();
  if (!normalized) return [];
  const parsed = parseScriptureReference(normalized.replace(/,\s+/g, ','));
  if (!parsed) return [];
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : verseStart;
  const keys: string[] = [];
  for (let v = verseStart; v <= verseEnd; v++) {
    keys.push(verseKey({ book: parsed.book, chapter: parsed.chapter, verse: v }));
  }
  return keys;
}

/** Merge highlight/passage refs into a cited-verse key set. Mutates `citedKeys`. Pure aside from mutation. */
export function addHighlightRefsToCitedKeys(citedKeys: Set<string>, references: string[]): void {
  for (const ref of references) {
    for (const k of verseKeysFromScriptureReference(ref)) {
      citedKeys.add(k);
    }
  }
}

/** Pure ranking: from a set of cross-ref rows, pick gaps the user hasn't cited. */
export function rankCrossRefGaps(
  crossRefs: Array<{ from: VerseRef; to: VerseRef; votes: number }>,
  citedKeys: Set<string>,
  opts: { limit?: number } = {},
): CrossRefGap[] {
  const { limit = 5 } = opts;
  const seen = new Set<string>();
  const out: CrossRefGap[] = [];
  for (const cr of crossRefs) {
    const toKey = verseKey(cr.to);
    if (citedKeys.has(toKey)) continue;
    if (seen.has(toKey)) continue;
    seen.add(toKey);
    out.push({
      from: { ...cr.from, displayRef: displayRef(cr.from) },
      to: { ...cr.to, displayRef: displayRef(cr.to) },
      votes: cr.votes,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Find cross-reference gaps for a user: passages TSK links FROM their cited passages that they
 * haven't written about or highlighted. Returns up to `limit` gaps, ranked by TSK vote count.
 */
export async function getCrossRefGaps(
  userId: string,
  opts: { limit?: number; minVotes?: number } = {},
): Promise<CrossRefGap[]> {
  const { limit = 5, minVotes = 1 } = opts;

  const cited = await db
    .select({
      book: ScriptureMetadata.book,
      chapter: ScriptureMetadata.chapter,
      verse: ScriptureMetadata.verse,
    })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(eq(Notes.userId, userId));

  if (!cited.length) return [];

  const citedKeys = new Set<string>();
  const deduped: VerseRef[] = [];
  for (const r of cited) {
    const k = verseKey(r);
    if (!citedKeys.has(k)) {
      citedKeys.add(k);
      deduped.push(r);
    }
  }

  const highlighted = await db
    .select({ scriptureReference: StudyThreadEntries.scriptureReference })
    .from(StudyThreadEntries)
    .where(
      and(
        eq(StudyThreadEntries.userId, userId),
        eq(StudyThreadEntries.isArchived, false),
        isNotNull(StudyThreadEntries.scriptureReference),
      ),
    );

  addHighlightRefsToCitedKeys(
    citedKeys,
    highlighted.map((r) => r.scriptureReference).filter((ref): ref is string => Boolean(ref?.trim())),
  );

  const sourceChunk = deduped.slice(0, 50);
  const fromAny = or(
    ...sourceChunk.map((p) =>
      and(
        eq(ScriptureCrossReferences.fromBook, p.book),
        eq(ScriptureCrossReferences.fromChapter, p.chapter),
        eq(ScriptureCrossReferences.fromVerse, p.verse),
      ),
    ),
  );

  const crossRows = await db
    .select({
      fromBook: ScriptureCrossReferences.fromBook,
      fromChapter: ScriptureCrossReferences.fromChapter,
      fromVerse: ScriptureCrossReferences.fromVerse,
      toBook: ScriptureCrossReferences.toBook,
      toChapter: ScriptureCrossReferences.toChapterStart,
      toVerse: ScriptureCrossReferences.toVerseStart,
      votes: ScriptureCrossReferences.votes,
    })
    .from(ScriptureCrossReferences)
    .where(and(fromAny, gte(ScriptureCrossReferences.votes, minVotes)))
    .orderBy(desc(ScriptureCrossReferences.votes))
    .limit(200);

  const mapped = crossRows.map((r) => ({
    from: { book: r.fromBook, chapter: r.fromChapter, verse: r.fromVerse },
    to: { book: r.toBook, chapter: r.toChapter, verse: r.toVerse },
    votes: r.votes,
  }));

  return rankCrossRefGaps(mapped, citedKeys, { limit });
}
