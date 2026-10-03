/**
 * "You've written on this passage before" — the pastor-prep half of the
 * teaching plan.
 *
 * Strictly the acting user's own notes. This is sermon prep, not analytics:
 * there is no orgId anywhere in this file and no path that reads another
 * person's writing. The church's hard line (see church-teaching-plan.ts) is that
 * a pastor never sees what the congregation wrote; that line holds here because
 * the only notes considered are the caller's.
 *
 * Matching is verse-key overlap, not string equality, so "Romans 8" finds a note
 * pilled with "Romans 8:1-11" and vice versa. Two storage shapes have to be
 * merged, exactly as `getCrossRefGaps` does: scripture pills embedded in note
 * HTML (current) and the legacy `NoteScriptureReferences` junction.
 */
import { db, Notes, NoteScriptureReferences, ScriptureMetadata, eq, and, ne, like } from '../db';
import { verseKeysFromScriptureReference } from '@/utils/scripture-verse-keys';
import { extractScripturePillsFromHtml } from './crossref-gaps';

export interface ReferenceMatchNote {
  id: string;
  title: string | null;
  updatedAt: Date | string | null;
}

/** A note carrying scripture pills in its HTML body. */
export interface PillCandidate extends ReferenceMatchNote {
  content: string;
}

/** A row from the legacy junction, already joined to its reference parts. */
export interface LegacyCandidate extends ReferenceMatchNote {
  reference: string;
}

export interface ReferenceMatchResult {
  id: string;
  title: string | null;
  updatedAt: Date | string | null;
}

function timeOf(value: Date | string | null): number {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Notes whose scripture overlaps `reference`, most recently updated first.
 *
 * Overlap, not containment: a note on Romans 8:1-11 is relevant when planning
 * Romans 8:18-30 only if they share verses — which they don't — but a note on
 * Romans 8 (whole chapter) shares verses with both. Sharing *any* verse is the
 * right bar for "have I been here before".
 */
export function matchNotesToReference(input: {
  reference: string;
  pillNotes: PillCandidate[];
  legacyNotes: LegacyCandidate[];
  /** Notes to leave out — e.g. the one being written from this very service. */
  excludeNoteIds?: string[];
}): ReferenceMatchResult[] {
  const targetKeys = new Set(verseKeysFromScriptureReference(input.reference));
  if (targetKeys.size === 0) return [];

  const excluded = new Set(input.excludeNoteIds ?? []);
  const byId = new Map<string, ReferenceMatchResult>();

  const overlaps = (candidateRef: string): boolean => {
    for (const key of verseKeysFromScriptureReference(candidateRef)) {
      if (targetKeys.has(key)) return true;
    }
    return false;
  };

  const remember = (note: ReferenceMatchNote) => {
    if (excluded.has(note.id) || byId.has(note.id)) return;
    byId.set(note.id, { id: note.id, title: note.title, updatedAt: note.updatedAt });
  };

  for (const note of input.pillNotes) {
    if (excluded.has(note.id) || byId.has(note.id)) continue;
    for (const pill of extractScripturePillsFromHtml(note.content ?? '')) {
      if (overlaps(pill.reference)) {
        remember(note);
        break;
      }
    }
  }

  // Legacy rows can duplicate a pill note; `remember` dedupes by id.
  for (const row of input.legacyNotes) {
    if (overlaps(row.reference)) remember(row);
  }

  return [...byId.values()].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
}

// ─── The query half, shared by GET /api/notes/by-reference and the Connector ────


export interface NoteCitingReference extends ReferenceMatchResult {
  /** HTML body; null for a legacy-only match whose note is locked. */
  content: string | null;
  contentEncrypted: boolean;
  /** The references in this note that overlap the requested passage. */
  references: string[];
}

/**
 * Every note of `userId`'s that cites a passage overlapping `reference`, most recently
 * updated first. `book` is the parsed book name — the SQL prefilter that keeps this from
 * scanning a whole library, since a pill for the passage always carries the book in its
 * markup.
 *
 * Owner-only, as the by-reference route always was. Locked notes never match through pills
 * (their body is ciphertext and is excluded here); a legacy junction row can still point at
 * one, so `contentEncrypted` is returned and each caller decides what to show.
 */
export async function findNotesCitingReference(
  userId: string,
  reference: string,
  book: string,
): Promise<NoteCitingReference[]> {
  const pillNotes = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(
      and(
        eq(Notes.userId, userId),
        ne(Notes.noteType, 'scripture'),
        eq(Notes.contentEncrypted, false),
        like(Notes.content, '%data-scripture-reference%'),
        like(Notes.content, `%${book}%`),
      ),
    );

  const legacyRows = await db
    .select({
      id: NoteScriptureReferences.noteId,
      title: Notes.title,
      content: Notes.content,
      contentEncrypted: Notes.contentEncrypted,
      updatedAt: Notes.updatedAt,
      reference: ScriptureMetadata.reference,
    })
    .from(NoteScriptureReferences)
    .innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
    .innerJoin(ScriptureMetadata, eq(ScriptureMetadata.noteId, NoteScriptureReferences.scriptureNoteId))
    .where(
      and(
        eq(Notes.userId, userId),
        ne(Notes.noteType, 'scripture'),
        // Locking keeps the reference rows; a locked note must not surface through them.
        eq(Notes.contentEncrypted, false),
        eq(ScriptureMetadata.book, book),
      ),
    );

  const legacyNotes = legacyRows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt,
    reference: row.reference ?? '',
  }));
  const matches = matchNotesToReference({ reference, pillNotes, legacyNotes });

  const target = new Set(verseKeysFromScriptureReference(reference));
  const overlaps = (ref: string) => verseKeysFromScriptureReference(ref).some((k) => target.has(k));
  const pillById = new Map(pillNotes.map((n) => [n.id, n]));
  const legacyById = new Map<string, (typeof legacyRows)[number]>();
  const legacyRefs = new Map<string, string[]>();
  for (const row of legacyRows) {
    legacyById.set(row.id, row);
    if (row.reference && overlaps(row.reference)) {
      legacyRefs.set(row.id, [...(legacyRefs.get(row.id) ?? []), row.reference]);
    }
  }

  return matches.map((match) => {
    const pill = pillById.get(match.id);
    const legacy = legacyById.get(match.id);
    const pillRefs = pill
      ? extractScripturePillsFromHtml(pill.content).map((p) => p.reference).filter(overlaps)
      : [];
    const references = [...new Set([...pillRefs, ...(legacyRefs.get(match.id) ?? [])])];
    const contentEncrypted = pill ? false : Boolean(legacy?.contentEncrypted);
    return {
      ...match,
      content: contentEncrypted ? null : (pill?.content ?? legacy?.content ?? null),
      contentEncrypted,
      references,
    };
  });
}
