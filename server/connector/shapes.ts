/**
 * Pure shaping for Connector results — what leaves the server, and what never does.
 *
 * Everything returned to an MCP client passes through one of these functions, which build
 * each result field by field from an allowlist. That is the privacy boundary: a row helper
 * that grows a new column (an author's name, an email, verse text) cannot reach a client
 * without someone adding it here on purpose.
 */

import { createHash } from 'node:crypto';
import { htmlToPortableBody } from '@/utils/portable-markdown';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import { MAX_BODY_CHARS, MAX_OFFSET } from './config';

/** A refusal the person (and their assistant) should read, not a crash. */
export class ConnectorRefusal extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'no_access'
      | 'not_subscribed'
      | 'disconnected'
      | 'rate_limited'
      | 'daily_limit'
      | 'bad_cursor'
      | 'bad_request',
    message: string,
  ) {
    super(message);
    this.name = 'ConnectorRefusal';
  }
}

export const NOTE_NOT_FOUND = "Note not found, or you don't have access to it.";
export const SPACE_NOT_FOUND = "Space not found, or you don't have access to it.";

export const LOCKED_NOTE_MESSAGE =
  'This note is locked. Its title and dates are shown; unlock it in Harvous to read it.';

const SNIPPET_CHARS = 240;

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanTitle(title: string | null | undefined): string {
  return title?.trim() || 'Untitled note';
}

/** Legacy scripture notes hold Bible text as their body — never returned (references only). */
export function isLegacyScriptureNote(noteType: string | null | undefined): boolean {
  return noteType === 'scripture';
}

/**
 * `stripHtmlForPreview` joins adjacent blocks with nothing between them ("…for ArkNow what…"),
 * so mark every block and line boundary with a space first.
 */
export function snippetFromHtml(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  const spaced = html.replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>|<br\s*\/?>/gi, '$& ');
  const text = stripHtmlForPreview(spaced, SNIPPET_CHARS).replace(/\s+/g, ' ').trim();
  return text || null;
}

/** Note HTML → Markdown. Scripture pills become their reference; highlights become `==text==`. */
export function bodyMarkdownFromHtml(html: string | null | undefined): {
  bodyMarkdown: string;
  truncated: boolean;
} {
  const md = htmlToPortableBody(html ?? '');
  if (md.length <= MAX_BODY_CHARS) return { bodyMarkdown: md, truncated: false };
  return { bodyMarkdown: md.slice(0, MAX_BODY_CHARS), truncated: true };
}

// ─── Note summary (lists and search) ───────────────────────────────────────────

export interface NoteSummaryInput {
  id: string;
  title: string | null;
  content: string | null;
  noteType?: string | null;
  contentEncrypted?: boolean | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  /** Author of the note; compared with the viewer, never returned. */
  authorUserId?: string | null;
  spaceId?: string | null;
  folder?: string | null;
  scriptureReference?: string | null;
}

export interface NoteSummary {
  id: string;
  title: string;
  snippet: string | null;
  locked: boolean;
  byYou: boolean;
  updatedAt: string | null;
  spaceId?: string | null;
  folder?: string | null;
  scriptureReference?: string | null;
}

export function toNoteSummary(row: NoteSummaryInput, viewerUserId: string): NoteSummary {
  const locked = Boolean(row.contentEncrypted);
  const legacyScripture = isLegacyScriptureNote(row.noteType);
  const summary: NoteSummary = {
    id: row.id,
    title: cleanTitle(row.title),
    snippet: locked || legacyScripture ? null : snippetFromHtml(row.content),
    locked,
    byYou: row.authorUserId == null ? true : row.authorUserId === viewerUserId,
    updatedAt: iso(row.updatedAt ?? row.createdAt),
  };
  if (row.spaceId !== undefined) summary.spaceId = row.spaceId ?? null;
  if (row.folder !== undefined) summary.folder = row.folder?.trim() || null;
  if (legacyScripture) summary.scriptureReference = row.scriptureReference ?? null;
  return summary;
}

// ─── Note detail (get_note) ────────────────────────────────────────────────────

export interface NoteDetailInput {
  id: string;
  title: string | null;
  content: string | null;
  noteType: string | null;
  contentEncrypted: boolean | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  authorUserId: string;
  folder?: string | null;
  otherFolders?: string[];
  tags?: string[];
  scriptureReferences?: Array<{ reference: string; translation?: string | null }>;
  /** Legacy scripture note: the reference it holds. */
  legacyScripture?: { reference: string | null; translation: string | null } | null;
  space?: { id: string; title: string | null } | null;
  highlights?: Array<{ text: string; note: string | null; kind: string }>;
}

export type NoteDetail =
  | {
      id: string;
      title: string;
      locked: true;
      createdAt: string | null;
      updatedAt: string | null;
      message: string;
    }
  | {
      id: string;
      title: string;
      locked: false;
      byYou: boolean;
      createdAt: string | null;
      updatedAt: string | null;
      bodyMarkdown: string | null;
      truncated: boolean;
      scriptureReferences: string[];
      folder?: string | null;
      otherFolders?: string[];
      tags?: string[];
      space?: { id: string; title: string } | null;
      highlights?: Array<{ text: string; note: string | null; kind: string }>;
      scripture?: { reference: string | null; translation: string | null };
    };

/** Your own locked note: metadata only. Not an error — the note exists and is yours. */
export function lockedNoteMetadata(row: Pick<NoteDetailInput, 'id' | 'title' | 'createdAt' | 'updatedAt'>): NoteDetail {
  return {
    id: row.id,
    title: cleanTitle(row.title),
    locked: true,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt ?? row.createdAt),
    message: LOCKED_NOTE_MESSAGE,
  };
}

function uniqueReferences(
  refs: Array<{ reference: string; translation?: string | null }> | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of refs ?? []) {
    const r = ref.reference?.trim();
    if (!r) continue;
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function toNoteDetail(row: NoteDetailInput, viewerUserId: string): NoteDetail {
  const byYou = row.authorUserId === viewerUserId;
  if (row.contentEncrypted) {
    // Callers hide others' locked notes before reaching here; this is the belt to that brace.
    if (!byYou) throw new ConnectorRefusal('not_found', NOTE_NOT_FOUND);
    return lockedNoteMetadata(row);
  }

  const legacyScripture = isLegacyScriptureNote(row.noteType);
  const { bodyMarkdown, truncated } = legacyScripture
    ? { bodyMarkdown: null, truncated: false }
    : bodyMarkdownFromHtml(row.content);

  const detail: NoteDetail = {
    id: row.id,
    title: cleanTitle(row.title),
    locked: false,
    byYou,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt ?? row.createdAt),
    bodyMarkdown,
    truncated,
    scriptureReferences: uniqueReferences(row.scriptureReferences),
  };
  if (legacyScripture) {
    detail.scripture = {
      reference: row.legacyScripture?.reference ?? null,
      translation: row.legacyScripture?.translation ?? null,
    };
  }
  // Organization belongs to whoever organized it: folders and tags are the author's own,
  // so they are shown only on your notes.
  if (byYou) {
    detail.folder = row.folder?.trim() || null;
    if (row.otherFolders?.length) detail.otherFolders = row.otherFolders;
    if (row.tags?.length) detail.tags = row.tags;
    if (row.highlights?.length) detail.highlights = row.highlights;
  }
  if (row.space) detail.space = { id: row.space.id, title: row.space.title?.trim() || 'Untitled space' };
  return detail;
}

// ─── Cursors ───────────────────────────────────────────────────────────────────

/**
 * Opaque pagination cursor: an offset bound to the tool and arguments that produced it.
 * A cursor replayed against a different query is refused rather than silently paging
 * through the wrong results.
 */
function argsHash(tool: string, scope: Record<string, unknown>): string {
  const stable = JSON.stringify(
    Object.keys(scope)
      .sort()
      .map((k) => [k, scope[k] ?? null]),
  );
  return createHash('sha256').update(`${tool}\u0000${stable}`).digest('hex').slice(0, 12);
}

export function encodeCursor(tool: string, scope: Record<string, unknown>, offset: number): string {
  return Buffer.from(JSON.stringify({ v: 1, o: offset, k: argsHash(tool, scope) })).toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined | null,
  tool: string,
  scope: Record<string, unknown>,
): number {
  if (!cursor) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new ConnectorRefusal('bad_cursor', "That cursor isn't valid. Start again without one.");
  }
  const p = parsed as { v?: unknown; o?: unknown; k?: unknown };
  if (p?.v !== 1 || typeof p.o !== 'number' || !Number.isInteger(p.o) || p.o < 0 || typeof p.k !== 'string') {
    throw new ConnectorRefusal('bad_cursor', "That cursor isn't valid. Start again without one.");
  }
  if (p.k !== argsHash(tool, scope)) {
    throw new ConnectorRefusal(
      'bad_cursor',
      "That cursor belongs to a different query. Repeat the same arguments, or start again without a cursor.",
    );
  }
  if (p.o > MAX_OFFSET) {
    throw new ConnectorRefusal(
      'bad_cursor',
      'That is as far as results go. Narrow the query (a space, a search term) to find more.',
    );
  }
  return p.o;
}

/** `nextCursor` for a page fetched with `limit + 1` rows; null at the end or past the cap. */
export function nextCursorFor(
  tool: string,
  scope: Record<string, unknown>,
  offset: number,
  limit: number,
  fetchedCount: number,
): string | null {
  if (fetchedCount <= limit) return null;
  const next = offset + limit;
  if (next > MAX_OFFSET) return null;
  return encodeCursor(tool, scope, next);
}
