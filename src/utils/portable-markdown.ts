/**
 * Harvous Portable Markdown — unified export/import format.
 * See docs/PORTABLE_MARKDOWN_FORMAT.md
 */
import yaml from 'js-yaml';
// @ts-expect-error no types available for turndown
import TurndownService from 'turndown';
import { isStudyHighlightAccentKey, type StudyHighlightAccentKey } from '@/utils/study-highlight-accents';

export type PortableHighlightKind = 'miniNote' | 'linkedNote' | 'scriptureLink' | 'reference' | 'workspace';

export interface PortableHighlight {
  id?: string;
  kind: PortableHighlightKind;
  accent: StudyHighlightAccentKey;
  anchorText?: string;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  annotation?: string;
  focusTitle?: string;
  notesBody?: string;
  scriptureReference?: string | null;
  scriptureTranslation?: string | null;
  scriptureExcerpt?: string | null;
  linkedNoteId?: string | null;
  linkedNoteTitle?: string | null;
}

export interface PortableNoteMeta {
  id?: string;
  title?: string | null;
  created?: string | null;
  updated?: string | null;
  space?: string | null;
  thread?: string | null;
  threadColor?: string | null;
  folder?: string | null;
  /** Secondary collection labels (excludes primary `folder`). */
  folders?: string[];
  tags?: string[];
  refs?: string[];
  noteType?: 'default' | 'scripture' | 'resource';
  scriptureReference?: string | null;
  scriptureTranslation?: string | null;
  pinned?: boolean;
  rating?: number | null;
}

export interface PortableNoteDocument {
  meta: PortableNoteMeta;
  body: string;
  highlights: PortableHighlight[];
}

export interface StudyThreadExportRow {
  id: string;
  entryKind: string;
  highlightAccentRaw: string;
  sourceSnippet: string;
  focusTitle: string;
  notesBody: string;
  miniNoteBody: string;
  linkedNoteId: string | null;
  linkedNoteTitle: string | null;
  anchorLocation: number | null;
  anchorLength: number | null;
  anchorTextSnapshot: string | null;
  scriptureReference: string | null;
  scripturePassageTranslation: string | null;
  scripturePassageExcerpt: string | null;
}

const ENTRY_KINDS = new Set<string>(['workspace', 'miniNote', 'linkedNote', 'scriptureLink', 'reference']);

const turndownWithMarks = (() => {
  const svc = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  svc.addRule('harvousHighlight', {
    filter: 'mark',
    replacement: (content: string) => `==${content}==`,
  });
  svc.addRule('scripturePill', {
    filter: (node: { nodeName?: string; classList?: { contains: (c: string) => boolean }; getAttribute?: (a: string) => string | null; textContent?: string | null }) =>
      node.nodeName === 'SPAN' && node.classList?.contains('scripture-pill'),
    replacement: (_content: string, node: { getAttribute?: (a: string) => string | null; textContent?: string | null }) => {
      const ref = node.getAttribute?.('data-scripture-reference') || node.textContent || '';
      return ref.trim();
    },
  });
  return svc;
})();

function normalizeAccent(raw: string | null | undefined): StudyHighlightAccentKey {
  if (raw && isStudyHighlightAccentKey(raw)) return raw;
  return 'warmAmber';
}

function normalizeKind(raw: string | null | undefined): PortableHighlightKind {
  if (raw && ENTRY_KINDS.has(raw)) return raw as PortableHighlightKind;
  return 'miniNote';
}

function annotationText(row: StudyThreadExportRow): string {
  if (row.miniNoteBody?.trim()) return row.miniNoteBody.trim();
  if (row.notesBody?.trim()) return row.notesBody.trim();
  return '';
}

function studyRowToPortable(row: StudyThreadExportRow): PortableHighlight {
  const anchorText = (row.anchorTextSnapshot || row.sourceSnippet || '').trim();
  return {
    id: row.id,
    kind: normalizeKind(row.entryKind),
    accent: normalizeAccent(row.highlightAccentRaw),
    anchorText: anchorText || undefined,
    anchorLocation: row.anchorLocation,
    anchorLength: row.anchorLength,
    annotation: annotationText(row) || undefined,
    focusTitle: row.focusTitle?.trim() || undefined,
    notesBody: row.notesBody?.trim() || undefined,
    scriptureReference: row.scriptureReference,
    scriptureTranslation: row.scripturePassageTranslation,
    scriptureExcerpt: row.scripturePassageExcerpt,
    linkedNoteId: row.linkedNoteId,
    linkedNoteTitle: row.linkedNoteTitle,
  };
}

export function studyRowsToPortableHighlights(rows: StudyThreadExportRow[]): PortableHighlight[] {
  return rows.filter((r) => !r.entryKind || r.entryKind !== 'workspace' || annotationText(r)).map(studyRowToPortable);
}

function quoteYamlString(s: string): string {
  if (/[:[\]"'\n#]/.test(s) || s.startsWith(' ') || s.endsWith(' ')) {
    return JSON.stringify(s);
  }
  return s;
}

function buildHighlightCallout(h: PortableHighlight): string {
  const label = h.anchorText
    ? `Highlight (${h.accent}) — "${h.anchorText.replace(/"/g, '\\"')}"`
    : h.scriptureReference
      ? `Scripture highlight (${h.accent}) — ${h.scriptureReference}`
      : `Highlight (${h.accent})`;
  const lines = (h.annotation || h.notesBody || h.focusTitle || '').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return '';
  return ['', `> [!note] ${label}`, ...lines.map((l) => `> ${l}`), ''].join('\n');
}

function htmlToPortableBody(html: string): string {
  if (!html?.trim()) return '';
  try {
    let md = turndownWithMarks.turndown(html);
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  } catch {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

function ensureInlineHighlights(body: string, highlights: PortableHighlight[]): string {
  let out = body;
  for (const h of highlights) {
    const text = h.anchorText?.trim();
    if (!text) continue;
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wrapped = `==${text}==`;
    if (out.includes(wrapped)) continue;
    const re = new RegExp(escaped);
    if (re.test(out)) {
      out = out.replace(re, wrapped);
    }
  }
  return out;
}

export function serializeNoteToPortable(
  meta: PortableNoteMeta,
  htmlContent: string,
  highlights: PortableHighlight[],
): string {
  const fm: Record<string, unknown> = {};
  if (meta.id) fm.id = meta.id;
  if (meta.title) fm.title = meta.title;
  if (meta.created) fm.created = meta.created;
  if (meta.updated) fm.updated = meta.updated;
  if (meta.space) fm.space = meta.space;
  if (meta.thread) fm.thread = meta.thread;
  if (meta.threadColor) fm.threadColor = meta.threadColor;
  if (meta.folder) fm.folder = meta.folder;
  if (meta.folders?.length) fm.folders = meta.folders;
  if (meta.tags?.length) fm.tags = meta.tags;
  if (meta.refs?.length) fm.refs = meta.refs;
  if (meta.noteType && meta.noteType !== 'default') fm.noteType = meta.noteType;
  if (meta.scriptureReference) fm.scriptureReference = meta.scriptureReference;
  if (meta.scriptureTranslation) fm.scriptureTranslation = meta.scriptureTranslation;
  if (meta.pinned) fm.pinned = true;
  if (meta.rating != null) fm.rating = meta.rating;
  if (highlights.length > 0) {
    fm.highlights = highlights.map((h) => {
      const row: Record<string, unknown> = { kind: h.kind, accent: h.accent };
      if (h.id) row.id = h.id;
      if (h.anchorText) row.anchorText = h.anchorText;
      if (h.anchorLocation != null) row.anchorLocation = h.anchorLocation;
      if (h.anchorLength != null) row.anchorLength = h.anchorLength;
      if (h.annotation) row.annotation = h.annotation;
      if (h.focusTitle) row.focusTitle = h.focusTitle;
      if (h.notesBody) row.notesBody = h.notesBody;
      if (h.scriptureReference) row.scriptureReference = h.scriptureReference;
      if (h.scriptureTranslation) row.scriptureTranslation = h.scriptureTranslation;
      if (h.scriptureExcerpt) row.scriptureExcerpt = h.scriptureExcerpt;
      if (h.linkedNoteId) row.linkedNoteId = h.linkedNoteId;
      if (h.linkedNoteTitle) row.linkedNoteTitle = h.linkedNoteTitle;
      return row;
    });
    fm.highlightsJSON = JSON.stringify(fm.highlights);
  }

  let body = htmlToPortableBody(htmlContent);
  body = ensureInlineHighlights(body, highlights);

  const lines: string[] = ['---', yaml.dump(fm, { lineWidth: 120, noRefs: true }).trim(), '---', ''];
  if (meta.title?.trim()) {
    lines.push(`# ${meta.title.trim()}`, '');
  }
  if (body) lines.push(body);
  for (const h of highlights) {
    const callout = buildHighlightCallout(h);
    if (callout) lines.push(callout);
  }
  if (!body && !meta.title?.trim() && highlights.length === 0) return lines.join('\n').trim() + '\n';
  return lines.join('\n').trim() + '\n';
}

function parseFrontmatterBlock(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) return null;
  const rest = trimmed.replace(/^---\r?\n?/, '');
  const endMatch = rest.match(/\r?\n---\r?\n/);
  if (!endMatch || endMatch.index == null) return null;
  const yamlBlock = rest.slice(0, endMatch.index);
  try {
    const parsed = yaml.load(yamlBlock);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseHighlightFromYaml(row: unknown): PortableHighlight | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const kind = normalizeKind(String(r.kind ?? 'miniNote'));
  const accent = normalizeAccent(String(r.accent ?? 'warmAmber'));
  const h: PortableHighlight = {
    kind,
    accent,
    id: r.id != null ? String(r.id) : undefined,
    anchorText: r.anchorText != null ? String(r.anchorText) : undefined,
    anchorLocation: typeof r.anchorLocation === 'number' ? r.anchorLocation : null,
    anchorLength: typeof r.anchorLength === 'number' ? r.anchorLength : null,
    annotation: r.annotation != null ? String(r.annotation) : undefined,
    focusTitle: r.focusTitle != null ? String(r.focusTitle) : undefined,
    notesBody: r.notesBody != null ? String(r.notesBody) : undefined,
    scriptureReference: r.scriptureReference != null ? String(r.scriptureReference) : null,
    scriptureTranslation: r.scriptureTranslation != null ? String(r.scriptureTranslation) : null,
    scriptureExcerpt: r.scriptureExcerpt != null ? String(r.scriptureExcerpt) : null,
    linkedNoteId: r.linkedNoteId != null ? String(r.linkedNoteId) : null,
    linkedNoteTitle: r.linkedNoteTitle != null ? String(r.linkedNoteTitle) : null,
  };
  return h;
}

function metaFromFrontmatter(fm: Record<string, unknown>): PortableNoteMeta {
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
  const refs = Array.isArray(fm.refs) ? fm.refs.map(String) : [];
  return {
    id: fm.id != null ? String(fm.id) : undefined,
    title: fm.title != null ? String(fm.title) : null,
    created: fm.created != null ? String(fm.created) : null,
    updated: fm.updated != null ? String(fm.updated) : null,
    space: fm.space != null ? String(fm.space) : null,
    thread: fm.thread != null ? String(fm.thread) : null,
    threadColor: fm.threadColor != null ? String(fm.threadColor) : null,
    folder: fm.folder != null ? String(fm.folder) : (fm.collection != null ? String(fm.collection) : null),
    folders: Array.isArray(fm.folders)
      ? fm.folders.map(String)
      : Array.isArray(fm.collections)
        ? fm.collections.map(String)
        : [],
    tags,
    refs,
    noteType: (fm.noteType as PortableNoteMeta['noteType']) || 'default',
    scriptureReference: fm.scriptureReference != null ? String(fm.scriptureReference) : null,
    scriptureTranslation: fm.scriptureTranslation != null ? String(fm.scriptureTranslation) : null,
    pinned: fm.pinned === true || fm.pinned === 'true',
    rating: typeof fm.rating === 'number' ? fm.rating : null,
  };
}

function stripPortableCallouts(body: string): string {
  return body.replace(/\n> \[!note\][^\n]*\n(?:> .*\n?)*/g, '\n').trim();
}

function stripLeadingTitle(body: string, title: string | null | undefined): string {
  if (!title?.trim()) return body.trim();
  const lines = body.split('\n');
  if (lines[0]?.trim() === `# ${title.trim()}`) {
    return lines.slice(1).join('\n').trim();
  }
  return body.trim();
}

export function parsePortableMarkdownDocument(markdown: string): PortableNoteDocument | null {
  const fm = parseFrontmatterBlock(markdown);
  if (!fm) return null;

  const trimmed = markdown.trim();
  const rest = trimmed.replace(/^---\r?\n?/, '');
  const endMatch = rest.match(/\r?\n---\r?\n/);
  if (!endMatch || endMatch.index == null) return null;
  let body = rest.slice(endMatch.index + endMatch[0].length);
  body = stripPortableCallouts(body);

  const meta = metaFromFrontmatter(fm);
  body = stripLeadingTitle(body, meta.title);

  const highlightsRaw = Array.isArray(fm.highlights) ? fm.highlights : [];
  let highlights = highlightsRaw.map(parseHighlightFromYaml).filter((h): h is PortableHighlight => h != null);

  if (highlights.length === 0 && fm.highlightsJSON != null) {
    try {
      const parsed = JSON.parse(String(fm.highlightsJSON));
      if (Array.isArray(parsed)) {
        highlights = parsed.map(parseHighlightFromYaml).filter((h): h is PortableHighlight => h != null);
      }
    } catch {
      /* ignore */
    }
  }

  if (highlights.length === 0) {
    highlights = inferHighlightsFromBody(body);
  }

  return { meta, body, highlights };
}

/** Split bulk export into individual portable documents. */
export function parsePortableMarkdownExport(content: string): PortableNoteDocument[] {
  const docs: PortableNoteDocument[] = [];
  const trimmed = content.trim();
  if (!trimmed) return docs;

  const parts = trimmed.split(/\n\n(?=---\n)/);
  for (const part of parts) {
    const doc = parsePortableMarkdownDocument(part.trim());
    if (doc) docs.push(doc);
  }
  return docs;
}

export function isPortableMarkdownExport(content: string): boolean {
  const fm = parseFrontmatterBlock(content.trim());
  if (!fm) return false;
  return (
    fm.id != null ||
    fm.highlights != null ||
    fm.thread != null ||
    fm.space != null ||
    fm.title != null
  );
}

/** Obsidian ==highlight== and callout/footnote conventions when frontmatter is absent. */
export function inferHighlightsFromBody(body: string): PortableHighlight[] {
  const highlights: PortableHighlight[] = [];
  const highlightRe = /==([^=\n]+?)==/g;
  let m: RegExpExecArray | null;
  while ((m = highlightRe.exec(body)) !== null) {
    const anchorText = m[1].trim();
    if (!anchorText) continue;
    highlights.push({
      kind: 'miniNote',
      accent: 'warmAmber',
      anchorText,
    });
  }

  const calloutRe = /> \[!note\] Highlight \((\w+)\)(?: — "([^"]+)")?[^\n]*\n((?:> .*\n?)*)/g;
  while ((m = calloutRe.exec(body)) !== null) {
    const accent = normalizeAccent(m[1]);
    const anchorText = m[2]?.trim();
    const annotation = m[3]
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    const existing = highlights.find((h) => h.anchorText === anchorText);
    if (existing) {
      existing.annotation = annotation;
      existing.accent = accent;
    } else if (anchorText || annotation) {
      highlights.push({
        kind: 'miniNote',
        accent,
        anchorText: anchorText || undefined,
        annotation: annotation || undefined,
      });
    }
  }

  return highlights;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Replace ==text== with <mark> tags using highlight metadata and id map. */
export function applyHighlightMarksToMarkdownBody(
  body: string,
  highlights: PortableHighlight[],
  idMap: Map<string, string>,
): string {
  let out = body.replace(/==([^=\n]+?)==/g, (_match, inner: string) => {
    const text = inner.trim();
    const h = highlights.find((x) => x.anchorText === text) || highlights.find((x) => x.anchorText?.includes(text));
    const studyId = h?.id ? idMap.get(h.id) || idMap.get(text) : idMap.get(text);
    const accent = h?.accent || 'warmAmber';
    const attrs = [`data-color="${escapeHtml(accent)}"`];
    if (studyId) attrs.push(`data-study-thread-id="${escapeHtml(studyId)}"`);
    return `<mark ${attrs.join(' ')}>${escapeHtml(text)}</mark>`;
  });

  for (const h of highlights) {
    const text = h.anchorText?.trim();
    if (!text) continue;
    const wrapped = `==${text}==`;
    if (out.includes(wrapped) || out.includes(`<mark`)) continue;
    const studyId = h.id ? idMap.get(h.id) : undefined;
    const accent = h.accent || 'warmAmber';
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped);
    if (re.test(out)) {
      const mark = `<mark data-color="${escapeHtml(accent)}"${studyId ? ` data-study-thread-id="${escapeHtml(studyId)}"` : ''}>${escapeHtml(text)}</mark>`;
      out = out.replace(re, mark);
    }
  }
  return out;
}

export function portableHighlightToStudyInsert(
  h: PortableHighlight,
  newId: string,
  parentNoteId: string,
  userId: string,
  spaceId: string | null,
  now: string,
) {
  const annotation = h.annotation?.trim() || '';
  const notesBody = h.notesBody?.trim() || (h.kind === 'workspace' ? annotation : '');
  const miniNoteBody = h.kind === 'workspace' ? '' : annotation;
  return {
    id: newId,
    userId,
    parentNoteId,
    spaceId,
    entryKindRaw: h.kind,
    highlightAccentRaw: h.accent,
    sourceSnippet: h.anchorText || h.scriptureExcerpt || '',
    focusTitle: h.focusTitle || '',
    notesBody,
    miniNoteBody,
    linkedNoteId: h.linkedNoteId || null,
    linkedNoteTitle: h.linkedNoteTitle || '',
    anchorLocation: h.anchorLocation ?? null,
    anchorLength: h.anchorLength ?? null,
    anchorTextSnapshot: h.anchorText || null,
    scriptureReference: h.scriptureReference || null,
    scripturePassageTranslation: h.scriptureTranslation || null,
    scripturePassageExcerpt: h.scriptureExcerpt || null,
    isArchived: false,
    highlightListEditedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface ParsedPortableImportNote {
  meta: PortableNoteMeta;
  markdownBody: string;
  highlights: PortableHighlight[];
}

export function portableDocumentToImportNote(doc: PortableNoteDocument): ParsedPortableImportNote {
  return {
    meta: doc.meta,
    markdownBody: doc.body,
    highlights: doc.highlights,
  };
}

export interface PortableImportBuildResult {
  title: string | null;
  htmlContent: string;
  highlights: PortableHighlight[];
  studyInserts: Array<Omit<ReturnType<typeof portableHighlightToStudyInsert>, 'parentNoteId' | 'userId'>>;
}

/** Prepare HTML content + study-thread rows for DB insert (parentNoteId/userId filled by caller). */
export function buildImportFromPortableDocument(
  doc: PortableNoteDocument,
  createStudyId: () => string,
  markdownToHtmlFn: (md: string) => string,
): PortableImportBuildResult {
  const idMap = new Map<string, string>();
  const assignedIds: string[] = [];
  for (const h of doc.highlights) {
    const newId = createStudyId();
    assignedIds.push(newId);
    if (h.id) idMap.set(h.id, newId);
    if (h.anchorText) idMap.set(h.anchorText, newId);
  }

  const bodyWithMarks = applyHighlightMarksToMarkdownBody(doc.body, doc.highlights, idMap);
  const htmlContent = markdownToHtmlFn(bodyWithMarks);

  const now = new Date().toISOString();
  const studyInserts = doc.highlights.map((h, index) => {
    const newId =
      (h.id && idMap.get(h.id)) ||
      (h.anchorText && idMap.get(h.anchorText)) ||
      assignedIds[index] ||
      createStudyId();
    const row = portableHighlightToStudyInsert(h, newId, '', '', null, now);
    const { parentNoteId: _p, userId: _u, ...rest } = row;
    return rest;
  });

  return {
    title: doc.meta.title || null,
    htmlContent,
    highlights: doc.highlights,
    studyInserts,
  };
}
