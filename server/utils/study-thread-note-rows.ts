import { db, Notes, eq, and, inArray } from '../db';
import { isStudyThreadNamingColumnMissing } from './pg-undefined-relation';

export type StudyThreadNoteRow = {
  id: string;
  title: string | null;
  content: string | null;
  simpleNoteId: number | null;
  noteType: string | null;
  studyThreadTitle: string | null;
  studyThreadUserOverride: boolean;
  studyThreadPinned: boolean;
  updatedAt: Date | null;
};

/** Loads note rows for thread graph; falls back when study-thread columns are not migrated yet. */
export async function fetchStudyThreadNoteRows(
  nodeIds: string[],
  userId: string,
): Promise<StudyThreadNoteRow[]> {
  if (nodeIds.length === 0) return [];

  try {
    const rows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        simpleNoteId: Notes.simpleNoteId,
        noteType: Notes.noteType,
        studyThreadTitle: Notes.studyThreadTitle,
        studyThreadUserOverride: Notes.studyThreadUserOverride,
        studyThreadPinned: Notes.studyThreadPinned,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(and(inArray(Notes.id, nodeIds), eq(Notes.userId, userId)));
    return rows.map((r) => ({
      ...r,
      studyThreadUserOverride: Boolean(r.studyThreadUserOverride),
      studyThreadPinned: Boolean(r.studyThreadPinned),
    }));
  } catch (error) {
    if (!isStudyThreadNamingColumnMissing(error)) throw error;
    const rows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        simpleNoteId: Notes.simpleNoteId,
        noteType: Notes.noteType,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(and(inArray(Notes.id, nodeIds), eq(Notes.userId, userId)));
    return rows.map((r) => ({
      ...r,
      studyThreadTitle: null,
      studyThreadUserOverride: false,
      studyThreadPinned: false,
    }));
  }
}
