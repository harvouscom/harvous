/**
 * Recurring dictionary reference words across a space (prototype Home recall).
 * Queries saved reference study-thread rows and ranks via deriveReferenceWordConnections.
 */

import { db, and, eq, StudyThreadEntries, Notes } from '../db';
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
    .where(
      and(
        eq(StudyThreadEntries.isArchived, false),
        eq(StudyThreadEntries.entryKindRaw, 'reference'),
        eq(StudyThreadEntries.userId, userId),
        eq(Notes.userId, userId),
        eq(Notes.spaceId, spaceId),
      ),
    );

  const eligible = rows.filter((row) => studyThreadEligibleForHighlightList(row));
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
