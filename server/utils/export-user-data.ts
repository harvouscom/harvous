/**
 * Generate CSV or Markdown export for a user (same format as GET /api/user/export).
 * Used by the export route and by the backup job.
 */
import JSZip from 'jszip';
import {
  db,
  Notes,
  NoteTags,
  Tags,
  ScriptureMetadata,
  StudyThreadEntries,
  NoteConnections,
  eq,
  desc,
  inArray,
} from '../db';
import { htmlToPlainText } from '../../src/utils/html-to-markdown';
import { dedupeById } from './import-dedupe';
import { parseNoteSecondaryCollections } from './note-secondary-collections';
import {
  serializeNoteToPortable,
  studyRowsToPortableHighlights,
  type StudyThreadExportRow,
} from '../../src/utils/portable-markdown';

export type ExportFormat = 'csv-threads' | 'markdown' | 'text';

/** Folder label used for notes with no primary collection. */
const UNSORTED_FOLDER = 'Unsorted';

/** Coerce a DB timestamp (Date | string | null) to an ISO string for portable meta. */
function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function generateUserExport(
  userId: string,
  format: ExportFormat
): Promise<{ content: string; fileExtension: string }> {
  const allNotes = dedupeById(await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      primaryCollection: Notes.primaryCollection,
      secondaryCollections: Notes.secondaryCollections,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .orderBy(desc(Notes.createdAt)));

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
  const scriptureNoteIds = allNotes.filter((n) => n.noteType === 'scripture').map((n) => n.id);
  if (scriptureNoteIds.length > 0) {
    try {
      const metaRows = await db
        .select()
        .from(ScriptureMetadata)
        .where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
      for (const meta of metaRows) {
        if (!scriptureMap.has(meta.noteId)) {
          scriptureMap.set(meta.noteId, { reference: meta.reference || '', translation: meta.translation || undefined });
        }
      }
    } catch {
      /* skip */
    }
  }

  const studyThreadsByNote = new Map<string, StudyThreadExportRow[]>();
  if (allNotes.length > 0) {
    try {
      const rows = await db
        .select()
        .from(StudyThreadEntries)
        .where(eq(StudyThreadEntries.userId, userId));
      for (const row of rows) {
        const mapped: StudyThreadExportRow = {
          id: row.id,
          entryKind: row.entryKindRaw,
          highlightAccentRaw: row.highlightAccentRaw,
          sourceSnippet: row.sourceSnippet,
          focusTitle: row.focusTitle,
          notesBody: row.notesBody,
          miniNoteBody: row.miniNoteBody,
          linkedNoteId: row.linkedNoteId,
          linkedNoteTitle: row.linkedNoteTitle,
          anchorLocation: row.anchorLocation,
          anchorLength: row.anchorLength,
          anchorTextSnapshot: row.anchorTextSnapshot,
          scriptureReference: row.scriptureReference,
          scripturePassageTranslation: row.scripturePassageTranslation,
          scripturePassageExcerpt: row.scripturePassageExcerpt,
        };
        if (!studyThreadsByNote.has(row.parentNoteId)) studyThreadsByNote.set(row.parentNoteId, []);
        studyThreadsByNote.get(row.parentNoteId)!.push(mapped);
      }
    } catch {
      /* StudyThreadEntries table may be missing on older DBs */
    }
  }

  /** Serialize one note to the portable-markdown format (folders, highlights, scripture). */
  const serializeNote = (note: (typeof allNotes)[number]): string => {
    const tags = noteTagsMap.get(note.id) || [];
    const scripture = scriptureMap.get(note.id);
    const highlights = studyRowsToPortableHighlights(studyThreadsByNote.get(note.id) || []);
    return serializeNoteToPortable(
      {
        id: note.id,
        title: note.title,
        created: isoOrNull(note.createdAt),
        updated: isoOrNull(note.updatedAt),
        space: note.spaceId || null,
        folder: note.primaryCollection || null,
        folders: parseNoteSecondaryCollections(note.secondaryCollections),
        tags: tags.map((t) => t.name),
        scriptureReference: scripture?.reference || null,
        scriptureTranslation: scripture?.translation || null,
      },
      note.content || '',
      highlights,
    ).trim();
  };

  let content = '';
  let fileExtension = 'txt';

  if (format === 'csv-threads') {
    const rows: string[][] = [
      ['Folder', 'Secondary Folders', 'Note Title', 'Note Content', 'Created Date', 'Updated Date', 'Tags', 'Highlights'],
    ];
    for (const note of allNotes) {
      const tags = noteTagsMap.get(note.id) || [];
      const secondary = parseNoteSecondaryCollections(note.secondaryCollections);
      const highlights = studyRowsToPortableHighlights(studyThreadsByNote.get(note.id) || []);
      const plainContent = htmlToPlainText(note.content || '');
      rows.push([
        escapeCSV(note.primaryCollection || UNSORTED_FOLDER),
        escapeCSV(secondary.join('; ')),
        escapeCSV(note.title || 'Untitled'),
        escapeCSV(plainContent),
        escapeCSV(note.createdAt || ''),
        escapeCSV(note.updatedAt || ''),
        escapeCSV(tags.map((t) => t.name).join(', ')),
        escapeCSV(highlights.length > 0 ? JSON.stringify(highlights) : ''),
      ]);
    }
    content = rows.map((row) => row.join(',')).join('\n');
    fileExtension = 'csv';
  } else if (format === 'markdown' || format === 'text') {
    content = allNotes.map(serializeNote).join('\n\n');
    fileExtension = 'md';
  } else {
    throw new Error(`Unsupported format: ${String(format)}`);
  }

  return { content, fileExtension };
}

function escapeCSV(value: unknown): string {
  const str = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

/** Sanitize a folder or note title for use as a filesystem path segment. */
function safePathSegment(name: string): string {
  return (name || '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled';
}

/**
 * Full round-trippable backup: one portable-markdown file per note, organized into
 * `{primaryCollection || 'Unsorted'}/` directories, plus a `manifest.json` capturing
 * the note index and the NoteConnections graph (which flat exports can't represent).
 */
export async function generateUserBackupZip(
  userId: string,
): Promise<{ content: ArrayBuffer; fileExtension: string }> {
  const allNotes = dedupeById(await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      primaryCollection: Notes.primaryCollection,
      secondaryCollections: Notes.secondaryCollections,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .orderBy(desc(Notes.createdAt)));

  const noteTagsMap = new Map<string, string[]>();
  if (allNotes.length > 0) {
    const allNoteTags = await db
      .select({ noteId: NoteTags.noteId, tagName: Tags.name })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(eq(Tags.userId, userId));
    allNoteTags.forEach((t) => {
      if (!noteTagsMap.has(t.noteId)) noteTagsMap.set(t.noteId, []);
      noteTagsMap.get(t.noteId)!.push(t.tagName);
    });
  }

  const scriptureMap = new Map<string, { reference: string; translation?: string }>();
  const scriptureNoteIds = allNotes.filter((n) => n.noteType === 'scripture').map((n) => n.id);
  if (scriptureNoteIds.length > 0) {
    try {
      const metaRows = await db
        .select()
        .from(ScriptureMetadata)
        .where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
      for (const meta of metaRows) {
        if (!scriptureMap.has(meta.noteId)) {
          scriptureMap.set(meta.noteId, { reference: meta.reference || '', translation: meta.translation || undefined });
        }
      }
    } catch {
      /* skip */
    }
  }

  const studyThreadsByNote = new Map<string, StudyThreadExportRow[]>();
  let highlightCount = 0;
  if (allNotes.length > 0) {
    try {
      const rows = await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.userId, userId));
      for (const row of rows) {
        const mapped: StudyThreadExportRow = {
          id: row.id,
          entryKind: row.entryKindRaw,
          highlightAccentRaw: row.highlightAccentRaw,
          sourceSnippet: row.sourceSnippet,
          focusTitle: row.focusTitle,
          notesBody: row.notesBody,
          miniNoteBody: row.miniNoteBody,
          linkedNoteId: row.linkedNoteId,
          linkedNoteTitle: row.linkedNoteTitle,
          anchorLocation: row.anchorLocation,
          anchorLength: row.anchorLength,
          anchorTextSnapshot: row.anchorTextSnapshot,
          scriptureReference: row.scriptureReference,
          scripturePassageTranslation: row.scripturePassageTranslation,
          scripturePassageExcerpt: row.scripturePassageExcerpt,
        };
        if (!studyThreadsByNote.has(row.parentNoteId)) studyThreadsByNote.set(row.parentNoteId, []);
        studyThreadsByNote.get(row.parentNoteId)!.push(mapped);
        highlightCount++;
      }
    } catch {
      /* table may be missing on older DBs */
    }
  }

  let connections: Array<{ fromNoteId: string; toNoteId: string }> = [];
  try {
    const rows = await db
      .select({ fromNoteId: NoteConnections.fromNoteId, toNoteId: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(eq(NoteConnections.userId, userId));
    connections = rows.map((r) => ({ fromNoteId: r.fromNoteId, toNoteId: r.toNoteId }));
  } catch {
    /* table may be missing on older DBs */
  }

  const zip = new JSZip();
  const usedPaths = new Set<string>();
  const manifestNotes: Array<{ id: string; file: string; primaryCollection: string | null; secondaryCollections: string[] }> = [];

  for (const note of allNotes) {
    const tags = noteTagsMap.get(note.id) || [];
    const scripture = scriptureMap.get(note.id);
    const secondary = parseNoteSecondaryCollections(note.secondaryCollections);
    const highlights = studyRowsToPortableHighlights(studyThreadsByNote.get(note.id) || []);
    const folderDir = safePathSegment(note.primaryCollection || UNSORTED_FOLDER);
    const datePrefix = (note.createdAt ? new Date(note.createdAt) : new Date()).toISOString().split('T')[0];
    const baseName = `${datePrefix} ${safePathSegment(note.title || 'Untitled')}`;
    let filePath = `${folderDir}/${baseName}.md`;
    let dedupe = 2;
    while (usedPaths.has(filePath)) {
      filePath = `${folderDir}/${baseName} (${dedupe++}).md`;
    }
    usedPaths.add(filePath);

    const md = serializeNoteToPortable(
      {
        id: note.id,
        title: note.title,
        created: isoOrNull(note.createdAt),
        updated: isoOrNull(note.updatedAt),
        space: note.spaceId || null,
        folder: note.primaryCollection || null,
        folders: secondary,
        tags,
        scriptureReference: scripture?.reference || null,
        scriptureTranslation: scripture?.translation || null,
      },
      note.content || '',
      highlights,
    );
    zip.file(filePath, md);
    manifestNotes.push({
      id: note.id,
      file: filePath,
      primaryCollection: note.primaryCollection || null,
      secondaryCollections: secondary,
    });
  }

  const manifest = {
    version: 1,
    app: 'harvous',
    exportedAt: new Date().toISOString(),
    counts: { notes: allNotes.length, highlights: highlightCount, connections: connections.length },
    notes: manifestNotes,
    connections,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const content = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return { content, fileExtension: 'zip' };
}
