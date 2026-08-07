/**
 * Normalize external annotated documents into portable markdown intermediate.
 * Word (.docx), HTML, and external markdown → PortableNoteDocument
 */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import {
  type PortableHighlight,
  type PortableNoteDocument,
  type PortableNoteMeta,
  inferHighlightsFromBody,
  parsePortableMarkdownDocument,
} from '@/utils/portable-markdown';
import { isStudyHighlightAccentKey, type StudyHighlightAccentKey } from '@/utils/study-highlight-accents';

const WORD_HIGHLIGHT_TO_ACCENT: Record<string, StudyHighlightAccentKey> = {
  yellow: 'warmAmber',
  green: 'mintGreen',
  cyan: 'skyBlue',
  turquoise: 'skyBlue',
  blue: 'skyBlue',
  magenta: 'violet',
  pink: 'coralRose',
  red: 'coralRose',
  darkred: 'coralRose',
  darkyellow: 'warmAmber',
  lightgray: 'neutral',
  gray: 'neutral',
  darkgray: 'neutral',
  black: 'neutral',
  white: 'neutral',
};

export function wordHighlightToAccent(val: string | null | undefined): StudyHighlightAccentKey {
  if (!val) return 'warmAmber';
  const key = val.toLowerCase().trim();
  return WORD_HIGHLIGHT_TO_ACCENT[key] || 'warmAmber';
}

export function htmlBackgroundToAccent(style: string | null | undefined): StudyHighlightAccentKey {
  if (!style) return 'warmAmber';
  const m = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
  const color = (m?.[1] || style).trim().toLowerCase();
  if (color.includes('yellow') || color === '#ffff00' || color === '#ff0') return 'warmAmber';
  if (color.includes('green')) return 'mintGreen';
  if (color.includes('blue') || color.includes('cyan')) return 'skyBlue';
  if (color.includes('violet') || color.includes('purple') || color.includes('magenta')) return 'violet';
  if (color.includes('red') || color.includes('coral') || color.includes('pink')) return 'coralRose';
  return 'warmAmber';
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface DocxTextRun {
  text: string;
  highlight?: string;
  commentIds: string[];
}

/** Parse Word .docx bytes into portable document (highlights + comments). */
export async function parseDocxToPortable(
  data: ArrayBuffer | Uint8Array,
  titleFallback = 'Imported note',
): Promise<PortableNoteDocument> {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  const commentsXml = await zip.file('word/comments.xml')?.async('string');

  const comments = parseDocxComments(commentsXml || '');
  const { plainText, runs } = parseDocxDocument(documentXml || '');

  const highlights: PortableHighlight[] = [];
  const commentRanges = findCommentRanges(documentXml || '', plainText, runs, comments);

  for (const range of commentRanges) {
    highlights.push({
      kind: 'miniNote',
      accent: range.accent,
      anchorText: range.text,
      annotation: range.annotation,
    });
  }

  for (const run of runs) {
    if (!run.highlight || !run.text.trim()) continue;
    const text = run.text.trim();
    if (highlights.some((h) => h.anchorText === text)) continue;
    highlights.push({
      kind: 'miniNote',
      accent: wordHighlightToAccent(run.highlight),
      anchorText: text,
    });
  }

  const body = injectObsidianHighlights(plainText, highlights);
  const meta: PortableNoteMeta = { title: titleFallback };

  return { meta, body, highlights: highlights.length ? highlights : inferHighlightsFromBody(body) };
}

function parseDocxComments(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml.trim()) return map;
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const comments = doc?.['w:comments']?.['w:comment'];
  const arr = Array.isArray(comments) ? comments : comments ? [comments] : [];
  for (const c of arr) {
    const id = String(c['@_w:id'] ?? c['@_id'] ?? '');
    const text = extractDocxText(c);
    if (id && text.trim()) map.set(id, text.trim());
  }
  return map;
}

function extractDocxText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (typeof n['w:t'] === 'string') return n['w:t'];
  if (n['w:t'] && typeof n['w:t'] === 'object' && '#text' in (n['w:t'] as object)) {
    return String((n['w:t'] as Record<string, unknown>)['#text'] ?? '');
  }
  let out = '';
  for (const [k, v] of Object.entries(n)) {
    if (k.startsWith('w:') && v) {
      if (Array.isArray(v)) out += v.map(extractDocxText).join('');
      else out += extractDocxText(v);
    }
  }
  return out;
}

function parseDocxDocument(xml: string): { plainText: string; runs: DocxTextRun[] } {
  if (!xml.trim()) return { plainText: '', runs: [] };
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name) => name === 'w:r' || name === 'w:t' });
  const doc = parser.parse(xml);
  const body = doc?.['w:document']?.['w:body'];
  const paragraphs = body?.['w:p'];
  const parArr = Array.isArray(paragraphs) ? paragraphs : paragraphs ? [paragraphs] : [];

  let plainText = '';
  const runs: DocxTextRun[] = [];

  for (const p of parArr) {
    const pRuns = p?.['w:r'];
    const rArr = Array.isArray(pRuns) ? pRuns : pRuns ? [pRuns] : [];
    for (const r of rArr) {
      const texts = r?.['w:t'];
      const tArr = Array.isArray(texts) ? texts : texts ? [texts] : [];
      let runText = '';
      for (const t of tArr) {
        runText += typeof t === 'string' ? t : String(t?.['#text'] ?? t ?? '');
      }
      const rPr = r?.['w:rPr'];
      const highlight = rPr?.['w:highlight']?.['@_w:val'] ?? rPr?.['w:highlight']?.['@_val'];
      runs.push({ text: runText, highlight: highlight ? String(highlight) : undefined, commentIds: [] });
      plainText += runText;
    }
    plainText += '\n';
  }

  return { plainText: plainText.trim(), runs };
}

interface CommentRange {
  text: string;
  annotation: string;
  accent: StudyHighlightAccentKey;
}

function findCommentRanges(
  xml: string,
  plainText: string,
  runs: DocxTextRun[],
  comments: Map<string, string>,
): CommentRange[] {
  const ranges: CommentRange[] = [];
  if (!xml.trim() || comments.size === 0) return ranges;

  const startRe = /<w:commentRangeStart w:id="(\d+)"/g;
  const endRe = /<w:commentRangeEnd w:id="(\d+)"/g;
  const starts: { id: string; index: number }[] = [];
  const ends: { id: string; index: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = startRe.exec(xml)) !== null) starts.push({ id: m[1], index: m.index });
  while ((m = endRe.exec(xml)) !== null) ends.push({ id: m[1], index: m.index });

  for (const start of starts) {
    const end = ends.find((e) => e.id === start.id && e.index > start.index);
    if (!end) continue;
    const annotation = comments.get(start.id) || '';
    const slice = xml.slice(start.index, end.index);
    const text = stripHtmlTags(slice.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!text && !annotation) continue;
    const accent = runs.find((r) => r.text && text.includes(r.text.trim()) && r.highlight)
      ? wordHighlightToAccent(runs.find((r) => r.highlight)?.highlight)
      : 'warmAmber';
    ranges.push({ text: text || annotation.slice(0, 40), annotation, accent });
  }

  if (ranges.length === 0 && plainText && comments.size > 0) {
    const firstComment = [...comments.values()][0];
    if (firstComment) {
      ranges.push({ text: plainText.slice(0, Math.min(80, plainText.length)), annotation: firstComment, accent: 'warmAmber' });
    }
  }

  return ranges;
}

export function parseHtmlToPortable(html: string, titleFallback = 'Imported note'): PortableNoteDocument {
  const highlights: PortableHighlight[] = [];

  const markRe = /<mark[^>]*data-color="([^"]*)"[^>]*>([\s\S]*?)<\/mark>/gi;
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(html)) !== null) {
    const accent = isStudyHighlightAccentKey(m[1]) ? m[1] : htmlBackgroundToAccent(m[1]);
    highlights.push({ kind: 'miniNote', accent, anchorText: stripHtmlTags(m[2]).trim() });
  }

  const spanRe = /<span[^>]*style="[^"]*background[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  while ((m = spanRe.exec(html)) !== null) {
    const full = m[0];
    const accent = htmlBackgroundToAccent(full.match(/style="([^"]*)"/i)?.[1]);
    const text = stripHtmlTags(m[1]).trim();
    if (text && !highlights.some((h) => h.anchorText === text)) {
      highlights.push({ kind: 'miniNote', accent, anchorText: text });
    }
  }

  const body = stripHtmlTags(html);
  const withHighlights = injectObsidianHighlights(body, highlights);
  return {
    meta: { title: titleFallback },
    body: withHighlights,
    highlights: highlights.length ? highlights : inferHighlightsFromBody(withHighlights),
  };
}

export function parseExternalMarkdownToPortable(md: string, titleFallback = 'Imported note'): PortableNoteDocument {
  const portable = parsePortableMarkdownDocument(md.trim());
  if (portable) return portable;

  const heading = md.match(/^#\s+(.+)$/m);
  const title = heading?.[1]?.trim() || titleFallback;
  let body = md.trim();
  if (heading) body = body.replace(/^#\s+.+\n?/, '').trim();

  const highlights = inferHighlightsFromBody(body);
  return {
    meta: { title },
    body,
    highlights,
  };
}

/**
 * Evernote export (.enex) → one portable document per contained note.
 *
 * ENEX is XML with each note's body stored as an ENML (XHTML) CDATA blob. Parsed
 * by string scanning rather than a real XML parser because exports routinely
 * contain unescaped entities and malformed inner markup that a strict parser
 * rejects outright — losing the whole file instead of one note.
 * Mirrors the native parser in HarvousVaultImportFormats.swift.
 */
export function parseEnexToPortableDocs(xml: string, titleFallback = 'Imported note'): PortableNoteDocument[] {
  const docs: PortableNoteDocument[] = [];
  const chunks = xml.split('<note>');
  for (const chunk of chunks.slice(1)) {
    const block = chunk.split('</note>')[0];
    if (!block) continue;
    const title = firstXmlTagContent(block, 'title') || titleFallback;

    const tags: string[] = [];
    const tagRe = /<tag>([^<]+)<\/tag>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(block)) !== null) {
      const t = decodeXmlEntities(tm[1]).trim();
      if (t) tags.push(t);
    }

    const content = extractCdataAfterTag(block, 'content') ?? firstXmlTagContent(block, 'content') ?? '';
    const enml = firstXmlTagContent(content, 'en-note') ?? content;
    const html = enmlToHtml(enml);

    // parseHtmlToPortable already extracts <mark>/background-color highlights and
    // strips tags, so the ENML → HTML step only has to normalize Evernote's own
    // elements into things it understands.
    const parsed = parseHtmlToPortable(html, title);
    docs.push({
      ...parsed,
      meta: {
        ...parsed.meta,
        title,
        created: enexDateToIso(firstXmlTagContent(block, 'created')),
        updated: enexDateToIso(firstXmlTagContent(block, 'updated')),
        tags,
      },
    });
  }
  return docs;
}

/** Evernote-specific ENML elements → plain HTML the shared parser understands. */
function enmlToHtml(enml: string): string {
  return enml
    .replace(/<en-todo[^>]*checked=["']true["'][^>]*\/?>/gi, '[x] ')
    .replace(/<en-todo[^>]*\/?>/gi, '[ ] ')
    .replace(/<en-media[^>]*\/?>/gi, '[attachment]')
    .replace(/<\/?en-note[^>]*>/gi, '')
    .replace(/<div>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>');
}

/** ENEX timestamps are `yyyyMMdd'T'HHmmssZ` (always UTC). */
function enexDateToIso(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function firstXmlTagContent(xml: string, tag: string): string | null {
  const open = xml.indexOf(`<${tag}>`);
  if (open === -1) return null;
  const close = xml.indexOf(`</${tag}>`, open);
  if (close === -1) return null;
  return decodeXmlEntities(xml.slice(open + tag.length + 2, close)).trim();
}

function extractCdataAfterTag(xml: string, tag: string): string | null {
  const open = xml.indexOf(`<${tag}>`);
  if (open === -1) return null;
  const start = xml.indexOf('<![CDATA[', open);
  if (start === -1) return null;
  const end = xml.indexOf(']]>', start);
  if (end === -1) return null;
  return xml.slice(start + 9, end);
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function injectObsidianHighlights(body: string, highlights: PortableHighlight[]): string {
  let out = body;
  for (const h of highlights) {
    const text = h.anchorText?.trim();
    if (!text) continue;
    const wrapped = `==${text}==`;
    if (out.includes(wrapped)) continue;
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped);
    if (re.test(out)) out = out.replace(re, wrapped);
  }
  return out;
}

export async function ingestFileToPortable(
  fileName: string,
  data: ArrayBuffer | string,
): Promise<PortableNoteDocument | null> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const title = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

  if (ext === 'docx') {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return parseDocxToPortable(buf, title);
  }
  if (ext === 'html' || ext === 'htm') {
    const html = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return parseHtmlToPortable(html, title);
  }
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    const md = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return parseExternalMarkdownToPortable(md, title);
  }
  if (ext === 'pdf') {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return parsePdfToPortable(buf, title);
  }
  return null;
}

/**
 * Ingest a file into portable documents. One file usually means one note, but an
 * Evernote `.enex` export holds a whole notebook, so the plural shape is the one
 * import uses — each contained note becomes its own reviewable, dedupable row.
 */
export async function ingestFileToPortableDocs(
  fileName: string,
  data: ArrayBuffer | string,
): Promise<PortableNoteDocument[]> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'enex') {
    const title = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const xml = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return parseEnexToPortableDocs(xml, title);
  }
  const single = await ingestFileToPortable(fileName, data);
  return single ? [single] : [];
}

async function parsePdfToPortable(data: ArrayBuffer, title: string): Promise<PortableNoteDocument | null> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(Buffer.from(data));
    const text = (result.text || '').trim();
    if (!text) return null;
    const body = text.replace(/\r\n/g, '\n');
    const highlights = inferHighlightsFromBody(body);
    return {
      meta: { title, tags: [], refs: [] },
      body,
      highlights,
    };
  } catch {
    return null;
  }
}
