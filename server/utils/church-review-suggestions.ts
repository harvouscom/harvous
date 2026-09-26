/**
 * The passages Harvous suggests a church turn into review questions.
 *
 * A fixed rule over what the church already published, and nothing else: every passage cited in
 * a channel's live notes, plus the passage of every service or sermon those notes were written
 * for. No model reads anything — a suggestion is a passage the church itself put in front of its
 * people, and its answer key is Scripture. See docs/CHURCH_V2_ROADMAP.md §B.
 *
 * Computed on read, never stored until staff act on it. Keeping one writes a published
 * exercise; dismissing one writes a `dismissed` row — so a passage staff have answered either way
 * is never suggested again, whatever status its row is in now.
 *
 * Shape of a suggestion:
 *   - one to three contiguous verses stay a **verse** exercise ("John 15:5", "John 15:5-7");
 *   - anything longer, or a whole chapter, becomes a **chapter** exercise ("John 15"):
 *     a question about eleven verses is a question about the chapter;
 *   - a range that crosses chapters is left out, because neither shape fits it honestly.
 */

import {
  db,
  ChurchReviewExercises,
  ChurchServicePublishedNotes,
  ChurchServices,
  Notes,
  ScriptureMetadata,
  SpaceNotes,
  and,
  desc,
  eq,
  inArray,
  isNull,
} from '../db';
import { chapterReferenceLabel, verseNodesForReference } from '@/utils/study-bible-nodes';

/** Verses a verse exercise may span. Past this it is a chapter question. */
export const SUGGESTED_VERSE_SPAN_MAX = 3;
/** How many of a channel's most recent notes are read. A bound, not a promise. */
const RECENT_NOTE_LIMIT = 200;
/** How many suggestions are offered at once. */
export const SUGGESTION_LIMIT = 24;

export type PassageShape = { kind: 'verse' | 'chapter'; reference: string };

/**
 * Pure: the exercise a cited reference becomes, or null. The reference it returns is also the
 * suggestion's dedupe key within the channel — one canonical spelling per passage.
 */
export function suggestionShapeFor(reference: string | null | undefined): PassageShape | null {
  if (!reference?.trim()) return null;
  const { verses, chapters } = verseNodesForReference(reference);
  if (chapters.length !== 1) return null;
  const chapter = chapters[0];
  if (verses.length === 0) return { kind: 'chapter', reference: chapterReferenceLabel(chapter) };
  if (verses.length > SUGGESTED_VERSE_SPAN_MAX) {
    return { kind: 'chapter', reference: chapterReferenceLabel(chapter) };
  }
  const numbers = verses.map((v) => v.verse).sort((a, b) => a - b);
  const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (!contiguous) return { kind: 'chapter', reference: chapterReferenceLabel(chapter) };
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const label = `${chapter.book} ${chapter.chapter}:${first}${last !== first ? `-${last}` : ''}`;
  return { kind: 'verse', reference: label };
}

export type ChurchReviewSuggestion = PassageShape & {
  /** The dedupe key — the canonical reference. */
  key: string;
  /** The note it was first found in, and that note's title, so staff can see where it came from. */
  sourceNoteId: string | null;
  sourceNoteTitle: string | null;
  /** The service it was taught at, when it came from a sermon's passage. */
  sourceServiceId: string | null;
  sourceServiceTitle: string | null;
  /** How many of the channel's notes cite it — a reason to put the common ones first. */
  citedIn: number;
};

type Candidate = {
  reference: string | null;
  noteId: string | null;
  noteTitle: string | null;
  serviceId: string | null;
  serviceTitle: string | null;
};

/**
 * Pure: candidates (newest first) → suggestions, deduped by canonical reference, minus every key
 * the channel already has a row for, most-cited first and then newest.
 */
export function rankSuggestions(
  candidates: readonly Candidate[],
  existingKeys: ReadonlySet<string>,
  limit = SUGGESTION_LIMIT,
): ChurchReviewSuggestion[] {
  const byKey = new Map<string, ChurchReviewSuggestion & { order: number; notes: Set<string> }>();
  candidates.forEach((candidate, order) => {
    const shape = suggestionShapeFor(candidate.reference);
    if (!shape || existingKeys.has(shape.reference)) return;
    const found = byKey.get(shape.reference);
    if (found) {
      if (candidate.noteId) found.notes.add(candidate.noteId);
      found.sourceServiceId ??= candidate.serviceId;
      found.sourceServiceTitle ??= candidate.serviceTitle;
      found.citedIn = found.notes.size;
      return;
    }
    const notes = new Set(candidate.noteId ? [candidate.noteId] : []);
    byKey.set(shape.reference, {
      ...shape,
      key: shape.reference,
      sourceNoteId: candidate.noteId,
      sourceNoteTitle: candidate.noteTitle,
      sourceServiceId: candidate.serviceId,
      sourceServiceTitle: candidate.serviceTitle,
      citedIn: notes.size,
      order,
      notes,
    });
  });
  return [...byKey.values()]
    .sort((a, b) => b.citedIn - a.citedIn || a.order - b.order)
    .slice(0, limit)
    .map(({ order: _order, notes: _notes, ...suggestion }) => suggestion);
}

/** Suggestions for one channel. The caller has already proven the viewer is its staff. */
export async function loadChurchReviewSuggestions(channelSpaceId: string): Promise<ChurchReviewSuggestion[]> {
  const notes = await db
    .select({ noteId: SpaceNotes.noteId, title: Notes.title })
    .from(SpaceNotes)
    .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
    .where(and(eq(SpaceNotes.spaceId, channelSpaceId), isNull(SpaceNotes.removedAt)))
    .orderBy(desc(SpaceNotes.addedAt))
    .limit(RECENT_NOTE_LIMIT);
  if (notes.length === 0) return [];

  const noteIds = notes.map((note) => note.noteId);
  const titleOf = new Map(notes.map((note) => [note.noteId, note.title ?? null]));
  const rank = new Map(noteIds.map((id, index) => [id, index]));

  const [cited, taught, existing] = await Promise.all([
    db
      .select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference })
      .from(ScriptureMetadata)
      .where(inArray(ScriptureMetadata.noteId, noteIds)),
    db
      .select({
        noteId: ChurchServicePublishedNotes.noteId,
        serviceId: ChurchServices.id,
        title: ChurchServices.title,
        reference: ChurchServices.reference,
      })
      .from(ChurchServicePublishedNotes)
      .innerJoin(ChurchServices, eq(ChurchServices.id, ChurchServicePublishedNotes.serviceId))
      .where(inArray(ChurchServicePublishedNotes.noteId, noteIds)),
    db
      .select({ key: ChurchReviewExercises.suggestionKey, reference: ChurchReviewExercises.scriptureReference })
      .from(ChurchReviewExercises)
      .where(eq(ChurchReviewExercises.channelSpaceId, channelSpaceId)),
  ]);

  // A passage the channel already has a question about — suggested or written by hand — is not
  // suggested again, whatever became of it.
  const existingKeys = new Set<string>();
  for (const row of existing) {
    if (row.key) existingKeys.add(row.key);
    const shape = suggestionShapeFor(row.reference);
    if (shape) existingKeys.add(shape.reference);
  }

  const candidates: Candidate[] = [
    ...taught.map((row) => ({
      reference: row.reference,
      noteId: row.noteId,
      noteTitle: titleOf.get(row.noteId) ?? null,
      serviceId: row.serviceId,
      serviceTitle: row.title,
    })),
    ...cited.map((row) => ({
      reference: row.reference,
      noteId: row.noteId,
      noteTitle: titleOf.get(row.noteId) ?? null,
      serviceId: null,
      serviceTitle: null,
    })),
  ].sort((a, b) => (rank.get(a.noteId ?? '') ?? 0) - (rank.get(b.noteId ?? '') ?? 0));

  return rankSuggestions(candidates, existingKeys);
}
