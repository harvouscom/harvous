import { and, asc, eq, inArray } from 'drizzle-orm';
import { ChildNoteResources, Notes, NoteScriptureReferences, NoteTags, NoteThreads, ScriptureMetadata, Tags, Threads } from '../db/schema';
import { parseNoteSecondaryCollections } from '../utils/note-secondary-collections';
import { familyReadings, familyThoughts } from './bible';
import { defaultChildPreferences } from '../../shared/child-notebook';
import { childNoteSelection, type Child, type FamilyTx } from './service';
import { exportVerseStickers } from './stickers';
import { exportVerseHighlights } from './highlights';
import { consentHistory } from './consents';

export async function exportChildNotebook(tx: FamilyTx, child: Child) {
  const ownNotes = tx.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, child.id));
  const notes = await tx.select({
    ...childNoteSelection,
    createdAt: Notes.createdAt,
    noteType: Notes.noteType,
    primaryCollection: Notes.primaryCollection,
    secondaryCollections: Notes.secondaryCollections,
    threadId: Notes.threadId
  }).from(Notes).where(eq(Notes.userId, child.id)).orderBy(asc(Notes.createdAt), asc(Notes.id));
  const tags = await tx.select({ id: Tags.id, name: Tags.name, color: Tags.color })
    .from(Tags).where(eq(Tags.userId, child.id));
  const threads = await tx.select({ id: Threads.id, title: Threads.title, color: Threads.color })
    .from(Threads).where(eq(Threads.userId, child.id));
  const tagLinks = await tx.select({ noteId: NoteTags.noteId, tagId: NoteTags.tagId }).from(NoteTags)
    .innerJoin(Tags, and(eq(Tags.id, NoteTags.tagId), eq(Tags.userId, child.id)))
    .where(inArray(NoteTags.noteId, ownNotes));
  const threadLinks = await tx.select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId }).from(NoteThreads)
    .innerJoin(Threads, and(eq(Threads.id, NoteThreads.threadId), eq(Threads.userId, child.id)))
    .where(inArray(NoteThreads.noteId, ownNotes));
  const scripture = { reference: ScriptureMetadata.reference, translation: ScriptureMetadata.translation };
  const directReferences = await tx.select({ noteId: ScriptureMetadata.noteId, ...scripture })
    .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, ownNotes));
  const linkedReferences = await tx.select({ noteId: NoteScriptureReferences.noteId, ...scripture })
    .from(NoteScriptureReferences)
    .innerJoin(ScriptureMetadata, eq(ScriptureMetadata.noteId, NoteScriptureReferences.scriptureNoteId))
    .where(and(inArray(NoteScriptureReferences.noteId, ownNotes), inArray(NoteScriptureReferences.scriptureNoteId, ownNotes)));
  const threadIds = new Set(threads.map(thread => thread.id));
  return {
    format: 'harvous-child-notebook' as const,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    displayName: child.displayName,
    preferences: child.notebookPreferences ?? defaultChildPreferences,
    bibleTranslations: child.bibleTranslations,
    familyBible: await Promise.all((await familyReadings(tx, child)).map(async reading => ({
      ...reading, thoughts: (await familyThoughts(tx, reading.id)).filter(thought => thought.role === 'child')
    }))),
    verseStickers: await exportVerseStickers(tx, child),
    verseHighlights: await exportVerseHighlights(tx, child),
    consentHistory: await consentHistory(tx, child),
    notes: notes.map(({ threadId, secondaryCollections, ...note }) => ({
      ...note,
      secondaryCollections: parseNoteSecondaryCollections(secondaryCollections),
      primaryThreadId: threadIds.has(threadId) ? threadId : null
    })),
    tags,
    threads,
    resourceLinks: await tx.select().from(ChildNoteResources).where(inArray(ChildNoteResources.noteId, ownNotes)),
    tagLinks,
    threadLinks,
    scriptureReferences: [...directReferences, ...linkedReferences]
  };
}
