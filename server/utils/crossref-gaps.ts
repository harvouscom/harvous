/**
 * Cross-reference gaps: passages the Treasury of Scripture Knowledge links FROM a user's cited
 * passages that the user has NOT cited in any note or passage highlight. These are the "you studied X
 * but never the connected Y" prompts for the generative recall carousel. Deterministic, no AI.
 */

import { verseKeyFromParts, verseKeysFromScriptureReference } from '@/utils/scripture-verse-keys';
import { normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';
import {
  db,
  eq,
  and,
  or,
  ne,
  gte,
  desc,
  isNotNull,
  Notes,
  ScriptureMetadata,
  ScriptureCrossReferences,
  StudyThreadEntries,
  NoteScriptureReferences,
} from '../db';

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface CrossRefGapSourceNote {
  noteId: string;
  translation: string;
}

export interface CrossRefGap {
  from: VerseRef & { displayRef: string };
  to: VerseRef & { displayRef: string };
  votes: number;
  fromNoteId: string;
  fromTranslation: string;
}

const verseKey = (v: VerseRef) => verseKeyFromParts(v);

function displayRef(v: VerseRef): string {
  return `${v.book} ${v.chapter}:${v.verse}`;
}

/** Re-export for server tests and callers that already import from here. */
export { verseKeysFromScriptureReference };

export type PillNoteRow = {
  id: string;
  content: string | null;
  updatedAt: Date | null;
};

/** Scripture pills embedded in default-note HTML (new Harvous — not legacy scripture noteType rows). */
export function extractScripturePillsFromHtml(html: string): Array<{ reference: string; translation: string }> {
  const out: Array<{ reference: string; translation: string }> = [];
  const re = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const reference = match[1]?.trim();
    if (!reference) continue;
    const transMatch = match[0].match(/data-scripture-translation\s*=\s*["']([^"']+)["']/i);
    const translation = transMatch?.[1]?.trim().toUpperCase() || 'NET';
    out.push({ reference, translation });
  }
  return out;
}

/** Map each cited verse to the parent study note that contains the pill. */
export function buildVerseSourceNoteMapFromPillNotes(notes: PillNoteRow[]): Map<string, CrossRefGapSourceNote> {
  const rows: Array<{
    book: string;
    chapter: number;
    verse: number;
    noteId: string;
    translation: string;
    noteUpdatedAt: Date | null;
  }> = [];

  for (const note of notes) {
    if (!note.content) continue;
    for (const pill of extractScripturePillsFromHtml(note.content)) {
      const normalized = normalizeScriptureReference(pill.reference) ?? pill.reference;
      const parsed = parseScriptureReference(normalized.replace(/,\s+/g, ','));
      if (!parsed) continue;
      const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
      const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : verseStart;
      for (let verse = verseStart; verse <= verseEnd; verse++) {
        rows.push({
          book: parsed.book,
          chapter: parsed.chapter,
          verse,
          noteId: note.id,
          translation: pill.translation,
          noteUpdatedAt: note.updatedAt,
        });
      }
    }
  }

  return buildVerseSourceNoteMap(rows);
}

/** Legacy: map cited verses to parent notes via NoteScriptureReferences → scripture child notes. */
export function buildVerseSourceNoteMapFromLegacyJunctions(
  rows: Array<{
    book: string;
    chapter: number;
    verse: number;
    noteId: string;
    translation: string;
    noteUpdatedAt: Date | null;
  }>,
): Map<string, CrossRefGapSourceNote> {
  return buildVerseSourceNoteMap(rows);
}

export function mergeVerseSourceNoteMaps(
  primary: Map<string, CrossRefGapSourceNote>,
  fallback: Map<string, CrossRefGapSourceNote>,
): Map<string, CrossRefGapSourceNote> {
  const out = new Map(primary);
  for (const [key, value] of fallback) {
    if (!out.has(key)) out.set(key, value);
  }
  return out;
}

function verseRefFromKey(key: string): VerseRef | null {
  const [book, chapterRaw, verseRaw] = key.split('|');
  const chapter = Number(chapterRaw);
  const verse = Number(verseRaw);
  if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  return { book, chapter, verse };
}

/** Merge highlight/passage refs into a cited-verse key set. Mutates `citedKeys`. Pure aside from mutation. */
export function addHighlightRefsToCitedKeys(citedKeys: Set<string>, references: string[]): void {
  for (const ref of references) {
    for (const k of verseKeysFromScriptureReference(ref)) {
      citedKeys.add(k);
    }
  }
}

/** Pick the most recently updated source note per cited verse key. Pure. */
export function buildVerseSourceNoteMap(
  rows: Array<{
    book: string;
    chapter: number;
    verse: number;
    noteId: string;
    translation: string;
    noteUpdatedAt: Date | null;
  }>,
): Map<string, CrossRefGapSourceNote> {
  const out = new Map<string, CrossRefGapSourceNote & { updatedAtMs: number }>();
  for (const row of rows) {
    const key = verseKey(row);
    const updatedAtMs = row.noteUpdatedAt?.getTime() ?? 0;
    const existing = out.get(key);
    if (existing && existing.updatedAtMs >= updatedAtMs) continue;
    out.set(key, { noteId: row.noteId, translation: row.translation, updatedAtMs });
  }
  const trimmed = new Map<string, CrossRefGapSourceNote>();
  for (const [key, value] of out) {
    trimmed.set(key, { noteId: value.noteId, translation: value.translation });
  }
  return trimmed;
}

/** Pure ranking: from a set of cross-ref rows, pick gaps the user hasn't cited. */
export function rankCrossRefGaps(
  crossRefs: Array<{ from: VerseRef; to: VerseRef; votes: number }>,
  citedKeys: Set<string>,
  verseSourceNotes: Map<string, CrossRefGapSourceNote>,
  opts: { limit?: number } = {},
): CrossRefGap[] {
  const { limit = 5 } = opts;
  const seen = new Set<string>();
  const out: CrossRefGap[] = [];
  for (const cr of crossRefs) {
    const toKey = verseKey(cr.to);
    if (citedKeys.has(toKey)) continue;
    if (seen.has(toKey)) continue;
    const source = verseSourceNotes.get(verseKey(cr.from));
    if (!source) continue;
    seen.add(toKey);
    out.push({
      from: { ...cr.from, displayRef: displayRef(cr.from) },
      to: { ...cr.to, displayRef: displayRef(cr.to) },
      votes: cr.votes,
      fromNoteId: source.noteId,
      fromTranslation: source.translation,
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

  const parentNotes = await db
    .select({
      id: Notes.id,
      content: Notes.content,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(
      and(eq(Notes.userId, userId), eq(Notes.contentEncrypted, false), ne(Notes.noteType, 'scripture')),
    );

  const pillSourceNotes = buildVerseSourceNoteMapFromPillNotes(parentNotes);

  const legacyJunctionRows = await db
    .select({
      book: ScriptureMetadata.book,
      chapter: ScriptureMetadata.chapter,
      verse: ScriptureMetadata.verse,
      noteId: NoteScriptureReferences.noteId,
      translation: ScriptureMetadata.translation,
      noteUpdatedAt: Notes.updatedAt,
    })
    .from(NoteScriptureReferences)
    .innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
    .innerJoin(ScriptureMetadata, eq(ScriptureMetadata.noteId, NoteScriptureReferences.scriptureNoteId))
    .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')));

  const verseSourceNotes = mergeVerseSourceNoteMaps(
    pillSourceNotes,
    buildVerseSourceNoteMapFromLegacyJunctions(legacyJunctionRows),
  );

  const citedKeys = new Set<string>();
  for (const key of verseSourceNotes.keys()) {
    citedKeys.add(key);
  }

  const metadataRows = await db
    .select({
      book: ScriptureMetadata.book,
      chapter: ScriptureMetadata.chapter,
      verse: ScriptureMetadata.verse,
      verseEnd: ScriptureMetadata.verseEnd,
      reference: ScriptureMetadata.reference,
    })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(eq(Notes.userId, userId));

  for (const row of metadataRows) {
    const ref =
      row.reference?.trim() ||
      `${row.book} ${row.chapter}:${row.verse}${row.verseEnd && row.verseEnd !== row.verse ? `-${row.verseEnd}` : ''}`;
    addHighlightRefsToCitedKeys(citedKeys, [ref]);
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

  if (!citedKeys.size) return [];

  const deduped: VerseRef[] = [];
  const seenSource = new Set<string>();
  for (const key of citedKeys) {
    if (seenSource.has(key)) continue;
    seenSource.add(key);
    const ref = verseRefFromKey(key);
    if (ref) deduped.push(ref);
  }

  const sourceChunk = deduped.slice(0, 50);
  if (!sourceChunk.length) return [];

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

  return rankCrossRefGaps(mapped, citedKeys, verseSourceNotes, { limit });
}
