/**
 * Recurring dictionary reference words across a space (prototype Home recall).
 * Queries saved reference study-thread rows and ranks via deriveReferenceWordConnections.
 */

import { db, and, eq, StudyThreadEntries, Notes, SpaceNotes, isNull } from '../db';
import {
  deriveReferenceWordConnections,
  type HomeReferenceWordConnection,
} from '@/utils/prototype-home-trends';
import { studyThreadEligibleForHighlightList } from '@/utils/study-thread-highlight-eligibility';

export interface BuildSpaceReferenceWordConnectionsOptions {
  limit?: number;
  minNotes?: number;
}

export async function buildSpaceReferenceWordConnections(
  spaceId: string,
  userId: string,
  options: BuildSpaceReferenceWordConnectionsOptions = {},
): Promise<{ connections: HomeReferenceWordConnection[] }> {
  void userId;
  const { limit = 3, minNotes = 2 } = options;

  const rows = await db
    .select({
      id: StudyThreadEntries.id,
      entryKindRaw: StudyThreadEntries.entryKindRaw,
      sourceSnippet: StudyThreadEntries.sourceSnippet,
      anchorTextSnapshot: StudyThreadEntries.anchorTextSnapshot,
      focusTitle: StudyThreadEntries.focusTitle,
      scripturePassageExcerpt: StudyThreadEntries.scripturePassageExcerpt,
      parentNoteId: StudyThreadEntries.parentNoteId,
      anchorLocation: StudyThreadEntries.anchorLocation,
      anchorLength: StudyThreadEntries.anchorLength,
      linkedNoteId: StudyThreadEntries.linkedNoteId,
      highlightListEditedAt: StudyThreadEntries.highlightListEditedAt,
      updatedAt: StudyThreadEntries.updatedAt,
      createdAt: StudyThreadEntries.createdAt,
    })
    .from(StudyThreadEntries)
    .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
    .innerJoin(
      SpaceNotes,
      and(
        eq(SpaceNotes.noteId, Notes.id),
        eq(SpaceNotes.spaceId, spaceId),
        isNull(SpaceNotes.removedAt),
      ),
    )
    .where(
      and(
        eq(StudyThreadEntries.isArchived, false),
        eq(StudyThreadEntries.entryKindRaw, 'reference'),
        eq(StudyThreadEntries.spaceId, spaceId),
        eq(Notes.contentEncrypted, false),
      ),
    );

  /**
   * Reference rows made while reading have no parent note. They are excluded rather than
   * passed through with a null: this derivation counts *notes* per word
   * ("across 4 of your notes") and opens the most recent one, so a null would both inflate
   * the count by a note that does not exist and give the card nothing to open.
   */
  const eligible = rows.filter(
    (row): row is typeof row & { parentNoteId: string } =>
      studyThreadEligibleForHighlightList(row) && Boolean(row.parentNoteId),
  );
  const inputs = eligible.map((row) => ({
    id: row.id,
    entryKind: 'reference',
    sourceSnippet: row.sourceSnippet,
    anchorTextSnapshot: row.anchorTextSnapshot,
    focusTitle: row.focusTitle,
    parentNoteId: row.parentNoteId,
    recencyMs:
      Date.parse(String(row.highlightListEditedAt ?? row.updatedAt ?? row.createdAt ?? '')) || 0,
  }));

  return {
    connections: deriveReferenceWordConnections(inputs, { limit, minNotes }),
  };
}
