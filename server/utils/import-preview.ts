/**
 * What one parsed import item will become, before anything is written.
 *
 * The body comes from `resolveImportNoteFields` — the same resolution commit uses —
 * so the preview shows the HTML the note will actually be created with, not a
 * second rendering of the source file that could drift from it.
 */
import { resolveImportNoteFields } from './import-commit';
import { importItemPayloadToRow, type ImportSessionItemRow } from './import-session';
import { importFormatForFileName } from './parse-import-files';
import type { ParsedCSVNote } from '@/utils/csv-parser';
import type { ParsedMarkdownNote } from '@/utils/markdown-import-parser';
import type { PortableHighlight } from '@/utils/portable-markdown';
import { STUDY_HIGHLIGHT_SWATCHES_WITH_NEUTRAL, type StudyHighlightAccentKey } from '@/utils/study-highlight-accents';

/** A long PDF or Word file can be hundreds of KB of HTML; nobody reads that much to decide. */
export const IMPORT_PREVIEW_MAX_HTML = 40 * 1024;

/** Highlights listed in the preview — enough to recognise the study, not the whole margin. */
const MAX_PREVIEW_HIGHLIGHTS = 50;

export interface ImportPreviewHighlight {
  kind: string;
  /** The colour it was highlighted in, so the preview shows the same mark the margin will. */
  accent: StudyHighlightAccentKey;
  anchorText: string | null;
  annotation: string | null;
  scriptureReference: string | null;
}

export interface ImportItemPreview {
  itemId: string;
  title: string;
  html: string;
  truncated: boolean;
  tags: string[];
  primaryCollection: string | null;
  secondaryCollections: string[];
  highlights: ImportPreviewHighlight[];
  highlightCount: number;
  createdDate: string | null;
  duplicateHint: string | null;
}

/**
 * Cut at the last tag boundary under the limit, so the cut never lands inside an
 * attribute. Unclosed elements are fine — the client sanitizer closes them.
 */
function capHtml(html: string): { html: string; truncated: boolean } {
  if (html.length <= IMPORT_PREVIEW_MAX_HTML) return { html, truncated: false };
  const slice = html.slice(0, IMPORT_PREVIEW_MAX_HTML);
  const lastClose = slice.lastIndexOf('>');
  const lastOpen = slice.lastIndexOf('<');
  return { html: lastOpen > lastClose ? slice.slice(0, lastOpen) : slice, truncated: true };
}

function previewHighlight(h: PortableHighlight): ImportPreviewHighlight {
  return {
    kind: h.kind,
    accent: (STUDY_HIGHLIGHT_SWATCHES_WITH_NEUTRAL as readonly string[]).includes(h.accent)
      ? h.accent
      : 'neutral',
    anchorText: h.anchorText?.trim() || null,
    annotation: (h.annotation || h.notesBody)?.trim() || null,
    scriptureReference: h.scriptureReference || null,
  };
}

export function buildImportItemPreview(item: ImportSessionItemRow): ImportItemPreview {
  const row = importItemPayloadToRow(item);
  const format = importFormatForFileName(item.fileName);
  const resolved = resolveImportNoteFields(row, format);
  const { html, truncated } = capHtml(resolved.content);

  const highlights =
    row.portableBuild?.highlights ?? (row.note as ParsedMarkdownNote).portable?.highlights ?? [];
  // The resolved date falls back to "now"; the preview only shows a date the file carried.
  const createdDate =
    format === 'csv-threads'
      ? (row.note as ParsedCSVNote).createdDate || null
      : (row.note as ParsedMarkdownNote).createdDate || null;

  return {
    itemId: item.id,
    title: item.title,
    html,
    truncated,
    tags: resolved.tags,
    primaryCollection: item.primaryCollection,
    secondaryCollections: row.secondaryCollections,
    highlights: highlights.slice(0, MAX_PREVIEW_HIGHLIGHTS).map(previewHighlight),
    highlightCount: item.highlightCount,
    createdDate,
    duplicateHint: item.duplicateHint,
  };
}
