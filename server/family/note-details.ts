import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { ChildNoteResources, Notes, NoteTags, NoteThreads, ScriptureMetadata, Tags, Threads } from '../db/schema';
import { passageInput, readChapter, requireApprovedTranslation, translationInput } from './bible';
import { childNoteSelection, ministryMaterials, type Child, type FamilyTx } from './service';

const labels = z.array(z.string().trim().min(1).max(48)).max(20);
export const noteDetailsInput = z.object({
  folder: z.string().trim().min(1).max(48).nullable(),
  tags: labels, threads: labels,
  scripture: z.array(z.object({ book: z.string().max(35), chapter: z.number().int().positive(),
    verse: z.number().int().positive(), translation: translationInput }).strict()).max(12),
  resources: z.array(z.object({ spaceId: z.string().max(100), noteId: z.string().max(100) }).strict()).max(12)
}).strict();

export async function childNoteDetails(tx: FamilyTx, child: Child, ids?: string[]) {
  const notes = await tx.select({ ...childNoteSelection, primaryCollection: Notes.primaryCollection }).from(Notes)
    .where(and(eq(Notes.userId, child.id), ids ? inArray(Notes.id, ids) : undefined))
    .orderBy(desc(sql`coalesce(${Notes.updatedAt}, ${Notes.createdAt})`), desc(Notes.createdAt), Notes.id).limit(500);
  const folders = ids ? await tx.selectDistinct({ name: Notes.primaryCollection }).from(Notes).where(eq(Notes.userId, child.id)) : notes.map(note => ({ name: note.primaryCollection }));
  const noteIds = notes.map(note => note.id);
  const tags = await tx.select({ id: Tags.id, name: Tags.name }).from(Tags).where(eq(Tags.userId, child.id));
  const threads = await tx.select({ id: Threads.id, title: Threads.title }).from(Threads).where(eq(Threads.userId, child.id));
  if (!noteIds.length) return { notes: [], catalog: { folders: [], tags, threads } };
  const tagLinks = await tx.select().from(NoteTags).where(inArray(NoteTags.noteId, noteIds));
  const threadLinks = await tx.select().from(NoteThreads).where(inArray(NoteThreads.noteId, noteIds));
  const scriptures = await tx.select({ noteId: ScriptureMetadata.noteId, reference: ScriptureMetadata.reference, book: ScriptureMetadata.book,
    chapter: ScriptureMetadata.chapter, verse: ScriptureMetadata.verse, translation: ScriptureMetadata.translation })
    .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, noteIds));
  const resources = await tx.select().from(ChildNoteResources).where(inArray(ChildNoteResources.noteId, noteIds));
  return {
    catalog: { folders: [...new Set(folders.flatMap(folder => folder.name ? [folder.name] : []))], tags, threads },
    notes: notes.map(note => ({ ...note,
      tagIds: tagLinks.filter(link => link.noteId === note.id).map(link => link.tagId),
      threadIds: threadLinks.filter(link => link.noteId === note.id).map(link => link.threadId),
      attachments: [
        ...scriptures.filter(item => item.noteId === note.id).map(({ noteId: _, ...item }) => ({ kind: 'scripture' as const, ...item })),
        ...resources.filter(item => item.noteId === note.id).map(item => ({ kind: 'resource' as const, resourceId: JSON.stringify([item.spaceId, item.resourceNoteId]) }))
      ]
    }))
  };
}

export async function writeChildNoteDetails(tx: FamilyTx, child: Child, noteId: string, input: z.infer<typeof noteDetailsInput>) {
  const now = new Date();
  await tx.update(Notes).set({ primaryCollection: input.folder }).where(and(eq(Notes.id, noteId), eq(Notes.userId, child.id)));
  const tags = await tx.select({ id: Tags.id, name: Tags.name }).from(Tags).where(eq(Tags.userId, child.id));
  const threads = await tx.select({ id: Threads.id, title: Threads.title }).from(Threads).where(eq(Threads.userId, child.id));
  const wantedTags = [...new Map(input.tags.map(name => [name.toLowerCase(), name])).values()];
  const wantedThreads = [...new Map(input.threads.map(title => [title.toLowerCase(), title])).values()];
  const missingTags = wantedTags.filter(name => !tags.some(tag => tag.name.toLowerCase() === name.toLowerCase()));
  const missingThreads = wantedThreads.filter(title => !threads.some(thread => thread.title.toLowerCase() === title.toLowerCase()));
  if (tags.length + missingTags.length > 200 || threads.length + missingThreads.length > 200) {
    throw new HTTPException(409, { message: 'Your notebook has reached its limit for tags or Threads.' });
  }
  if (missingTags.length) tags.push(...await tx.insert(Tags).values(missingTags.map(name => ({
    id: `tag_${crypto.randomUUID()}`, name, userId: child.id, createdAt: now, updatedAt: now
  }))).returning({ id: Tags.id, name: Tags.name }));
  if (missingThreads.length) threads.push(...await tx.insert(Threads).values(missingThreads.map(title => ({
    id: `thread_${crypto.randomUUID()}`, title, userId: child.id, spaceId: child.homeSpaceId, createdAt: now, updatedAt: now
  }))).returning({ id: Threads.id, title: Threads.title }));
  const tagIds = wantedTags.map(name => tags.find(tag => tag.name.toLowerCase() === name.toLowerCase())!.id);
  const threadIds = wantedThreads.map(title => threads.find(thread => thread.title.toLowerCase() === title.toLowerCase())!.id);
  await tx.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
  await tx.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
  if (tagIds.length) await tx.insert(NoteTags).values(tagIds.map(tagId => ({ id: crypto.randomUUID(), noteId, tagId, createdAt: now })));
  if (threadIds.length) await tx.insert(NoteThreads).values(threadIds.map(threadId => ({ id: crypto.randomUUID(), noteId, threadId, createdAt: now })));

  // Preserve existing citations if a parent later removes the translation.
  const existing = await tx.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
  const references = [];
  for (const { verse, ...passage } of new Map(input.scripture.map(item => [JSON.stringify(item), item])).values()) {
    const retained = existing.find(item => item.book === passage.book && item.chapter === passage.chapter && item.verse === verse && item.translation === passage.translation);
    if (retained) { references.push(retained); continue; }
    passageInput.parse(passage);
    requireApprovedTranslation(child, passage.translation);
    const text = (await readChapter(tx, passage)).verses.find(item => item.verse === verse)?.text;
    if (!text) throw new HTTPException(404, { message: 'This verse is unavailable.' });
    references.push({ id: crypto.randomUUID(), noteId, ...passage, verse, originalText: text,
      reference: `${passage.book} ${passage.chapter}:${verse}`, createdAt: now });
  }
  await tx.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
  if (references.length) await tx.insert(ScriptureMetadata).values(references);

  const retainedResources = await tx.select().from(ChildNoteResources).where(eq(ChildNoteResources.noteId, noteId));
  const resources = [];
  for (const resource of new Map(input.resources.map(item => [JSON.stringify(item), item])).values()) {
    if (!retainedResources.some(item => item.spaceId === resource.spaceId && item.resourceNoteId === resource.noteId)
      && !(await ministryMaterials(tx, child, resource)).length) {
      throw new HTTPException(404, { message: 'This reading is no longer shared.' });
    }
    resources.push({ noteId, spaceId: resource.spaceId, resourceNoteId: resource.noteId });
  }
  await tx.delete(ChildNoteResources).where(eq(ChildNoteResources.noteId, noteId));
  if (resources.length) await tx.insert(ChildNoteResources).values(resources);
}
