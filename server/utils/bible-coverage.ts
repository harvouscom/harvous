/**
 * Loads "Your Bible" for one account — every chapter read, cited or highlighted, all-time.
 *
 * Four owner-scoped reads, run together, folded by the pure `buildBibleCoverage`
 * (src/utils/bible-coverage.ts). Owner-scoped is the point: a shared space's other members
 * cite chapters too, and their study filling in your map would be a map of someone else.
 *
 * All-time, unlike `/api/reading/recent`'s 180 days. This is a map, not history, and the free
 * history window is about how far back the feed lets you scroll, not about what you have
 * been in.
 */

import {
  db,
  Notes,
  ReadingEvents,
  ScriptureMetadata,
  StudyThreadEntries,
  UserNodeStates,
  and,
  eq,
  inArray,
  isNotNull,
} from '../db';
import {
  buildBibleCoverage,
  chaptersInRange,
  type BibleCoverage,
  type ChapterRef,
} from '@/utils/bible-coverage';
import { chapterKeyPartsFromNodeKey } from '@/utils/study-bible-nodes';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { isUserNodeStatesTableMissing } from './pg-undefined-relation';

/** Glances are a page passing by; only reading counts as reading. */
const READ_BUCKETS = ['read', 'study'];

/** Highlights store a reference string, not columns. A range across chapters marks each. */
export function chaptersForReference(reference: string): ChapterRef[] {
  const parsed = parseScriptureReference(reference);
  if (!parsed) return [];
  return chaptersInRange(parsed.book, parsed.chapter, parsed.endChapter);
}

async function chapterNodeRows(userId: string) {
  try {
    return await db
      .select({
        nodeKey: UserNodeStates.nodeKey,
        revisitCount: UserNodeStates.revisitCount,
        explicitConnectionCount: UserNodeStates.explicitConnectionCount,
        expansionCount: UserNodeStates.expansionCount,
        synthesisCount: UserNodeStates.synthesisCount,
        reviewCount: UserNodeStates.reviewCount,
      })
      .from(UserNodeStates)
      .where(
        and(
          eq(UserNodeStates.userId, userId),
          eq(UserNodeStates.status, 'active'),
          eq(UserNodeStates.nodeKind, 'chapter'),
        ),
      );
  } catch (error) {
    // An unmigrated database is a map without depth, not a broken one.
    if (isUserNodeStatesTableMissing(error)) return [];
    throw error;
  }
}

export async function loadBibleCoverage(userId: string): Promise<BibleCoverage> {
  const [readRows, citedRows, highlightRows, nodes] = await Promise.all([
    db
      .selectDistinct({ book: ReadingEvents.book, chapter: ReadingEvents.chapter })
      .from(ReadingEvents)
      .where(and(eq(ReadingEvents.userId, userId), inArray(ReadingEvents.dwellBucket, READ_BUCKETS))),
    // ScriptureMetadata has no userId; the note it hangs off does. Legacy scripture child notes
    // are the user's own notes too, so the join reaches them without NoteScriptureReferences.
    db
      .selectDistinct({
        noteId: ScriptureMetadata.noteId,
        book: ScriptureMetadata.book,
        chapter: ScriptureMetadata.chapter,
        chapterEnd: ScriptureMetadata.chapterEnd,
      })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
      .where(eq(Notes.userId, userId)),
    db
      .selectDistinct({ reference: StudyThreadEntries.scriptureReference })
      .from(StudyThreadEntries)
      .where(and(eq(StudyThreadEntries.userId, userId), isNotNull(StudyThreadEntries.scriptureReference))),
    chapterNodeRows(userId),
  ]);

  const cited = citedRows.flatMap((row) =>
    chaptersInRange(row.book, row.chapter, row.chapterEnd).map((ref) => ({ ...ref, noteId: row.noteId })),
  );
  const highlighted = highlightRows.flatMap((row) => (row.reference ? chaptersForReference(row.reference) : []));

  const depth = nodes.flatMap((row) => {
    const parts = chapterKeyPartsFromNodeKey(row.nodeKey);
    return parts ? [{ ...parts, ...row }] : [];
  });

  return buildBibleCoverage({ read: readRows, cited, highlighted, depth });
}
