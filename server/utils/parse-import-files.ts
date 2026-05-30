/**
 * Shared import file parsing for preview + commit routes.
 */
import { parseCSV, type ParsedCSVNote } from '@/utils/csv-parser';
import { parseMarkdownExport, type ParsedMarkdownNote } from '@/utils/markdown-import-parser';
import { buildImportFromPortableDocument } from '@/utils/portable-markdown';
import { ingestFileToPortable } from '@/utils/portable-ingest';
import { generateStudyThreadEntryId } from '@/utils/ids';
import { markdownToHtml } from '@/utils/markdown-to-html';

export type ImportFormat = 'markdown' | 'csv-threads';

export interface ParsedImportRow {
  index: number;
  fileName: string;
  folderPath: string | null;
  title: string;
  highlightCount: number;
  tagCount: number;
  sourceType: string;
  note: ParsedCSVNote | ParsedMarkdownNote;
  portableBuild?: ReturnType<typeof buildImportFromPortableDocument>;
}

function getFolderPath(file: File): string | null {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (relativePath) {
    const pathParts = relativePath.split('/');
    if (pathParts.length > 1) return pathParts.slice(0, -1).join('/');
  }
  return null;
}

export async function parseImportFiles(
  files: File[],
  format: ImportFormat,
): Promise<{ rows: ParsedImportRow[]; warnings: string[]; unsupported: string[] }> {
  const rows: ParsedImportRow[] = [];
  const warnings: string[] = [];
  const unsupported: string[] = [];
  let index = 0;

  for (const file of files) {
    const fileName = file.name || 'import';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const folderPath = getFolderPath(file);

    if (ext === 'pdf') {
      try {
        const buf = await file.arrayBuffer();
        const portable = await ingestFileToPortable(fileName, buf);
        if (!portable) {
          warnings.push(`${fileName}: could not extract text from PDF (highlights may be lost).`);
          continue;
        }
        const built = buildImportFromPortableDocument(portable, generateStudyThreadEntryId, markdownToHtml);
        rows.push({
          index: index++,
          fileName,
          folderPath,
          title: built.title || portable.meta.title || 'Untitled',
          highlightCount: portable.highlights.length,
          tagCount: portable.meta.tags?.length ?? 0,
          sourceType: 'pdf',
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
      } catch {
        unsupported.push(fileName);
      }
      continue;
    }

    if (ext === 'docx' || ext === 'html' || ext === 'htm' || ext === 'enex') {
      const buf = await file.arrayBuffer();
      const portable = await ingestFileToPortable(fileName, buf);
      if (!portable) {
        warnings.push(`${fileName}: no content recognized.`);
        continue;
      }
      const built = buildImportFromPortableDocument(portable, generateStudyThreadEntryId, markdownToHtml);
      rows.push({
        index: index++,
        fileName,
        folderPath,
        title: built.title || portable.meta.title || 'Untitled',
        highlightCount: portable.highlights.length,
        tagCount: portable.meta.tags?.length ?? 0,
        sourceType: ext,
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
      continue;
    }

    const fileContent = await file.text();
    let parsedNotes: Array<ParsedCSVNote | ParsedMarkdownNote> = [];
    if (format === 'csv-threads') parsedNotes = parseCSV(fileContent);
    else parsedNotes = parseMarkdownExport(fileContent);

    if (parsedNotes.length === 0) {
      warnings.push(`${fileName}: no notes found.`);
      continue;
    }

    for (const note of parsedNotes) {
      const mdNote = note as ParsedMarkdownNote;
      const portableBuild =
        mdNote.portable != null
          ? buildImportFromPortableDocument(mdNote.portable, generateStudyThreadEntryId, markdownToHtml)
          : undefined;
      rows.push({
        index: index++,
        fileName,
        folderPath,
        title: mdNote.title || 'Untitled',
        highlightCount: mdNote.portable?.highlights?.length ?? portableBuild?.studyInserts.length ?? 0,
        tagCount: mdNote.tags?.length ?? 0,
        sourceType: ext || format,
        note,
        portableBuild,
      });
    }
  }

  return { rows, warnings, unsupported };
}
