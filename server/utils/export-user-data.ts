/**
 * Generate CSV or Markdown export for a user (same format as GET /api/user/export).
 * Used by the export route and by the backup job.
 */
import {
  db,
  first,
  Notes,
  Threads,
  NoteThreads,
  NoteTags,
  Tags,
  ScriptureMetadata,
  eq,
  desc,
} from '../db';
import { htmlToPlainText, htmlToMarkdown } from '../../src/utils/html-to-markdown';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';

export type ExportFormat = 'csv-threads' | 'markdown' | 'text';

export async function generateUserExport(
  userId: string,
  format: ExportFormat
): Promise<{ content: string; fileExtension: string }> {
  const allNotes = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .orderBy(desc(Notes.createdAt));

  const allThreads = await db
    .select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
    })
    .from(Threads)
    .where(eq(Threads.userId, userId));

  const threadMap = new Map(allThreads.map((t) => [t.id, t]));

  const allNoteThreadsRows = await db
    .select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId })
    .from(NoteThreads)
    ;
  const noteThreadMap = new Map<string, string[]>();
  allNoteThreadsRows.forEach((nt) => {
    if (!noteThreadMap.has(nt.noteId)) noteThreadMap.set(nt.noteId, []);
    noteThreadMap.get(nt.noteId)!.push(nt.threadId);
  });

  const noteTagsMap = new Map<string, Array<{ name: string; category?: string }>>();
  if (allNotes.length > 0) {
    const allNoteTags = await db
      .select({
        noteId: NoteTags.noteId,
        tagName: Tags.name,
        tagCategory: Tags.category,
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(eq(Tags.userId, userId))
      ;
    allNoteTags.forEach((tag) => {
      if (!noteTagsMap.has(tag.noteId)) noteTagsMap.set(tag.noteId, []);
      noteTagsMap.get(tag.noteId)!.push({ name: tag.tagName, category: tag.tagCategory || undefined });
    });
  }

  const scriptureMap = new Map<string, { reference: string; translation?: string }>();
  const scriptureNotes = allNotes.filter((n) => n.noteType === 'scripture');
  for (const sn of scriptureNotes) {
    try {
      const meta = first(await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, sn.id)).limit(1));
      if (meta) scriptureMap.set(sn.id, { reference: meta.reference || '', translation: meta.translation || undefined });
    } catch {
      /* skip */
    }
  }

  let content = '';
  let fileExtension = 'txt';

  if (format === 'csv-threads') {
    const rows: string[][] = [['Thread Title', 'Thread Color', 'Note Title', 'Note Content', 'Created Date', 'Tags']];
    const escapeCSV = (value: unknown) => {
      const str =
        value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };
    for (const note of allNotes) {
      const noteThreadIds = noteThreadMap.get(note.id) || [];
      const primaryThreadId = noteThreadIds[0] || note.threadId;
      const thread = threadMap.get(primaryThreadId!);
      const tags = noteTagsMap.get(note.id) || [];
      const plainContent = htmlToPlainText(note.content || '');
      rows.push([
        escapeCSV(thread?.title || MY_PILE_THREAD_TITLE),
        escapeCSV(thread?.color || ''),
        escapeCSV(note.title || 'Untitled'),
        escapeCSV(plainContent),
        escapeCSV(note.createdAt || ''),
        escapeCSV(tags.map((t) => t.name).join(', ')),
      ]);
    }
    content = rows.map((row) => row.join(',')).join('\n');
    fileExtension = 'csv';
  } else if (format === 'markdown' || format === 'text') {
    const lines: string[] = [];
    for (const note of allNotes) {
      const noteThreadIds = noteThreadMap.get(note.id) || [];
      const primaryThreadId = noteThreadIds[0] || note.threadId;
      const thread = threadMap.get(primaryThreadId!);
      const tags = noteTagsMap.get(note.id) || [];
      const scripture = scriptureMap.get(note.id);
      if (note.title) lines.push(`# ${note.title}`, '');
      lines.push(htmlToMarkdown(note.content || ''), '');
      lines.push('---');
      lines.push(`**Created:** ${note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Unknown'}`);
      if (note.updatedAt) lines.push(`**Updated:** ${new Date(note.updatedAt).toLocaleDateString()}`);
      if (thread) {
        lines.push(`**Thread:** ${thread.title}`);
        if (thread.color) lines.push(`**Thread Color:** ${thread.color}`);
      }
      if (tags.length > 0) lines.push(`**Tags:** ${tags.map((t) => t.name).join(', ')}`);
      if (scripture) lines.push(`**Scripture Reference:** ${scripture.reference}${scripture.translation ? ` (${scripture.translation})` : ''}`);
      lines.push('---', '', '');
    }
    content = lines.join('\n');
    fileExtension = 'md';
  } else {
    throw new Error(`Unsupported format: ${String(format)}`);
  }

  return { content, fileExtension };
}
