/**
 * Shared import file parsing for preview + commit routes.
 */
import JSZip from 'jszip';
import { parseCSV, type ParsedCSVNote } from '@/utils/csv-parser';
import { parseMarkdownExport, type ParsedMarkdownNote } from '@/utils/markdown-import-parser';
import { buildImportFromPortableDocument } from '@/utils/portable-markdown';
import { ingestFileToPortableDocs } from '@/utils/portable-ingest';
import { generateStudyThreadEntryId } from '@/utils/ids';
import { markdownToHtml } from '@/utils/markdown-to-html';
import { resolveImportCollections } from './note-secondary-collections';

export type ImportFormat = 'markdown' | 'csv-threads';

export interface ParsedImportRow {
  index: number;
  fileName: string;
  folderPath: string | null;
  title: string;
  highlightCount: number;
  tagCount: number;
  sourceType: string;
  /** Destination folder resolved from frontmatter or directory structure. */
  primaryCollection: string | null;
  secondaryCollections: string[];
  note: ParsedCSVNote | ParsedMarkdownNote;
  portableBuild?: ReturnType<typeof buildImportFromPortableDocument>;
}

export interface ParseImportResult {
  rows: ParsedImportRow[];
  warnings: string[];
  unsupported: string[];
  /** NoteConnections (by portable note id) recovered from a backup manifest. */
  connections: Array<{ fromNoteId: string; toNoteId: string }>;
}

/** Binary formats run through the portable ingest pipeline. */
const BINARY_EXTS = new Set(['pdf', 'docx', 'html', 'htm', 'enex']);

function getFolderPath(file: File): string | null {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (relativePath) {
    const pathParts = relativePath.split('/');
    if (pathParts.length > 1) return pathParts.slice(0, -1).join('/');
  }
  return null;
}

export interface ParseEntry {
  fileName: string;
  folderPath: string | null;
  text: () => Promise<string>;
  buffer: () => Promise<ArrayBuffer>;
}

/** CSVs carry thread rows; everything else goes down the markdown/portable path. */
export function importFormatForFileName(fileName: string): ImportFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ext === 'csv' ? 'csv-threads' : 'markdown';
}

/**
 * Parse a single file into import rows. The session-based import calls this once
 * per uploaded file so each request stays small; `parseImportFiles` below is the
 * batch wrapper the legacy single-request endpoint still uses.
 */
export async function parseImportEntry(
  entry: ParseEntry,
  format: ImportFormat,
  startIndex = 0,
): Promise<{ rows: ParsedImportRow[]; warnings: string[]; unsupported: string[] }> {
  const rows: ParsedImportRow[] = [];
  const warnings: string[] = [];
  const unsupported: string[] = [];
  await parseEntry(entry, format, rows, warnings, unsupported, { index: startIndex });
  return { rows, warnings, unsupported };
}

export async function parseImportFiles(
  files: File[],
  format: ImportFormat,
): Promise<ParseImportResult> {
  const rows: ParsedImportRow[] = [];
  const warnings: string[] = [];
  const unsupported: string[] = [];
  const connections: Array<{ fromNoteId: string; toNoteId: string }> = [];
  const counter = { index: 0 };

  for (const file of files) {
    const fileName = file.name || 'import';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (ext === 'zip') {
      await parseZip(file, format, rows, warnings, unsupported, connections, counter);
      continue;
    }

    await parseEntry(
      {
        fileName,
        folderPath: getFolderPath(file),
        text: () => file.text(),
        buffer: () => file.arrayBuffer(),
      },
      format,
      rows,
      warnings,
      unsupported,
      counter,
    );
  }

  return { rows, warnings, unsupported, connections };
}

async function parseZip(
  file: File,
  format: ImportFormat,
  rows: ParsedImportRow[],
  warnings: string[],
  unsupported: string[],
  connections: Array<{ fromNoteId: string; toNoteId: string }>,
  counter: { index: number },
): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    unsupported.push(file.name);
    return;
  }

  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    const path = entry.name;
    const base = path.split('/').pop() || path;
    // Backup manifest: recover the NoteConnections graph.
    if (base === 'manifest.json') {
      try {
        const manifest = JSON.parse(await entry.async('string')) as {
          connections?: Array<{ fromNoteId?: string; toNoteId?: string }>;
        };
        for (const c of manifest.connections || []) {
          if (c.fromNoteId && c.toNoteId) connections.push({ fromNoteId: c.fromNoteId, toNoteId: c.toNoteId });
        }
      } catch {
        /* ignore malformed manifest */
      }
      continue;
    }
    // Skip hidden/system files (e.g. __MACOSX, .DS_Store, Harvous _harvous sidecars).
    if (base.startsWith('.') || path.split('/').some((seg) => seg === '__MACOSX' || seg === '_harvous')) continue;
    const ext = base.split('.').pop()?.toLowerCase() || '';
    const inner = path.split('/');
    const folderPath = inner.length > 1 ? inner.slice(0, -1).join('/') : null;

    await parseEntry(
      {
        fileName: base,
        folderPath,
        text: () => entry.async('string'),
        buffer: () => entry.async('arraybuffer'),
      },
      ext === 'csv' ? 'csv-threads' : 'markdown',
      rows,
      warnings,
      unsupported,
      counter,
    );
  }
}

async function parseEntry(
  entry: ParseEntry,
  format: ImportFormat,
  rows: ParsedImportRow[],
  warnings: string[],
  unsupported: string[],
  counter: { index: number },
): Promise<void> {
  const { fileName, folderPath } = entry;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (BINARY_EXTS.has(ext)) {
    let portableDocs;
    try {
      portableDocs = await ingestFileToPortableDocs(fileName, await entry.buffer());
    } catch {
      unsupported.push(fileName);
      return;
    }
    if (portableDocs.length === 0) {
      warnings.push(`${fileName}: no content recognized.`);
      return;
    }
    // An .enex export is a whole notebook — one file, many notes.
    for (const portable of portableDocs) {
      const built = buildImportFromPortableDocument(portable, generateStudyThreadEntryId, markdownToHtml);
      const collections = resolveImportCollections(portable.meta.folder, portable.meta.folders, folderPath);
      rows.push({
        index: counter.index++,
        fileName,
        folderPath,
        title: built.title || portable.meta.title || 'Untitled',
        highlightCount: portable.highlights.length,
        tagCount: portable.meta.tags?.length ?? 0,
        sourceType: ext,
        primaryCollection: collections.primary,
        secondaryCollections: collections.secondary,
        note: {
          title: built.title || portable.meta.title || 'Untitled',
          content: portable.body,
          createdDate: portable.meta.created || null,
          updatedDate: portable.meta.updated || null,
          threadName: portable.meta.thread || null,
          threadColor: portable.meta.threadColor || null,
          tags: portable.meta.tags || [],
          scriptureReference: portable.meta.scriptureReference || null,
          scriptureTranslation: portable.meta.scriptureTranslation || null,
          portable,
        },
        portableBuild: built,
      });
    }
    return;
  }

  const fileContent = await entry.text();
  let parsedNotes: Array<ParsedCSVNote | ParsedMarkdownNote> = [];
  if (format === 'csv-threads') parsedNotes = parseCSV(fileContent);
  else parsedNotes = parseMarkdownExport(fileContent);

  if (parsedNotes.length === 0) {
    warnings.push(`${fileName}: no notes found.`);
    return;
  }

  for (const note of parsedNotes) {
    if (format === 'csv-threads') {
      const csvNote = note as ParsedCSVNote;
      const collections = resolveImportCollections(
        csvNote.primaryCollection ?? null,
        csvNote.secondaryCollections ?? [],
        folderPath,
      );
      rows.push({
        index: counter.index++,
        fileName,
        folderPath,
        title: csvNote.noteTitle || 'Untitled',
        highlightCount: 0,
        tagCount: csvNote.tags?.length ?? 0,
        sourceType: ext || format,
        primaryCollection: collections.primary,
        secondaryCollections: collections.secondary,
        note,
      });
      continue;
    }

    const mdNote = note as ParsedMarkdownNote;
    const portableBuild =
      mdNote.portable != null
        ? buildImportFromPortableDocument(mdNote.portable, generateStudyThreadEntryId, markdownToHtml)
        : undefined;
    const collections = resolveImportCollections(
      mdNote.portable?.meta.folder ?? null,
      mdNote.portable?.meta.folders ?? [],
      folderPath,
    );
    rows.push({
      index: counter.index++,
      fileName,
      folderPath,
      title: mdNote.title || 'Untitled',
      highlightCount: mdNote.portable?.highlights?.length ?? portableBuild?.studyInserts.length ?? 0,
      tagCount: mdNote.tags?.length ?? 0,
      sourceType: ext || format,
      primaryCollection: collections.primary,
      secondaryCollections: collections.secondary,
      note,
      portableBuild,
    });
  }
}
