import { FREE_HISTORY_WINDOW_DAYS } from '@/lib/billing-plans';
import { startsNewEditingSession } from './note-version-thinning';

const DAY_MS = 24 * 60 * 60 * 1000;

export const NOTE_HISTORY_PAGE_DEFAULT = 30;
export const NOTE_HISTORY_PAGE_MAX = 50;
export const NOTE_HISTORY_RAW_PAGE_MAX = 200;
export const NOTE_HISTORY_SCAN_LIMIT = 2000;

export type NoteHistoryRow = {
  id: string;
  version: number;
  title: string | null;
  contentEncrypted: boolean;
  source: string;
  createdAt: Date;
  editedBy: string | null;
  authorId: string;
};

export type NoteHistorySession = {
  id: string;
  version: number;
  startVersion: number;
  title: string | null;
  contentEncrypted: boolean;
  source: string;
  editorUserId: string;
  startedAt: string;
  endedAt: string;
  versionCount: number;
  isCurrent: boolean;
};

export type NoteHistoryRawVersion = {
  id: string;
  version: number;
  title: string | null;
  contentEncrypted: boolean;
  source: string;
  editorUserId: string;
  createdAt: string;
  isCurrent: boolean;
};

export type NoteHistoryLock = { before: string } | null;

export function historyVisibleSince(now: Date, hasFullHistory: boolean): Date | null {
  return hasFullHistory ? null : new Date(now.getTime() - FREE_HISTORY_WINDOW_DAYS * DAY_MS);
}

/** A version stays visible until the version that replaced it falls outside the window. */
export function isReplacedBeforeWindow(replacedAt: Date | null, since: Date | null): boolean {
  return since !== null && replacedAt !== null && replacedAt.getTime() < since.getTime();
}

export function parseNoteHistoryQuery(input: {
  before?: string;
  limit?: string;
  raw?: string;
}): { before: number | null; limit: number; raw: boolean } {
  const raw = input.raw === '1' || input.raw === 'true';
  const before = Number(input.before);
  const limit = Number(input.limit);
  const max = raw ? NOTE_HISTORY_RAW_PAGE_MAX : NOTE_HISTORY_PAGE_MAX;
  return {
    before: Number.isInteger(before) && before > 0 ? before : null,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, max) : NOTE_HISTORY_PAGE_DEFAULT,
    raw,
  };
}

function lockFor(since: Date | null): NoteHistoryLock {
  return since ? { before: since.toISOString() } : null;
}

function checkpoint(row: NoteHistoryRow) {
  return { source: row.source, createdAt: row.createdAt, editorId: row.editedBy ?? row.authorId };
}

/** Rows arrive newest first; each session is represented by its last checkpoint. */
export function buildNoteHistorySessionsPage(input: {
  rowsNewestFirst: readonly NoteHistoryRow[];
  scanLimitReached: boolean;
  successorCreatedAt: Date | null;
  currentVersionId: string | null;
  since: Date | null;
  limit: number;
}): { sessions: NoteHistorySession[]; nextCursor: number | null; locked: NoteHistoryLock } {
  const groups: Array<{ rows: NoteHistoryRow[]; replacedAt: Date | null }> = [];
  let open: NoteHistoryRow[] = [];
  let replacedAt = input.successorCreatedAt;
  for (const row of input.rowsNewestFirst) {
    const newer = open[open.length - 1];
    if (newer && startsNewEditingSession({ previous: checkpoint(row), next: checkpoint(newer) })) {
      groups.push({ rows: open, replacedAt });
      replacedAt = newer.createdAt;
      open = [];
    }
    open.push(row);
  }
  if (open.length > 0) groups.push({ rows: open, replacedAt });
  // The oldest group may continue past the scan, so leave it for the next page.
  if (input.scanLimitReached && groups.length > 1) groups.pop();

  const sessions: NoteHistorySession[] = [];
  for (const group of groups) {
    const end = group.rows[0];
    const start = group.rows[group.rows.length - 1];
    const isCurrent = end.id === input.currentVersionId;
    if (!isCurrent && isReplacedBeforeWindow(group.replacedAt, input.since)) {
      return { sessions, nextCursor: null, locked: lockFor(input.since) };
    }
    if (sessions.length === input.limit) {
      return { sessions, nextCursor: sessions[sessions.length - 1].startVersion, locked: null };
    }
    sessions.push({
      id: end.id,
      version: end.version,
      startVersion: start.version,
      title: end.title,
      contentEncrypted: end.contentEncrypted,
      source: end.source,
      editorUserId: end.editedBy ?? end.authorId,
      startedAt: start.createdAt.toISOString(),
      endedAt: end.createdAt.toISOString(),
      versionCount: group.rows.length,
      isCurrent,
    });
  }
  const nextCursor =
    input.scanLimitReached && sessions.length > 0 ? sessions[sessions.length - 1].startVersion : null;
  return { sessions, nextCursor, locked: null };
}

/** Ungrouped rows for support recovery, under the same window. Fetch `limit + 1` rows. */
export function buildNoteHistoryRawPage(input: {
  rowsNewestFirst: readonly NoteHistoryRow[];
  successorCreatedAt: Date | null;
  currentVersionId: string | null;
  since: Date | null;
  limit: number;
}): { versions: NoteHistoryRawVersion[]; nextCursor: number | null; locked: NoteHistoryLock } {
  const versions: NoteHistoryRawVersion[] = [];
  for (let index = 0; index < input.rowsNewestFirst.length; index += 1) {
    const row = input.rowsNewestFirst[index];
    const replacedAt = index === 0 ? input.successorCreatedAt : input.rowsNewestFirst[index - 1].createdAt;
    const isCurrent = row.id === input.currentVersionId;
    if (!isCurrent && isReplacedBeforeWindow(replacedAt, input.since)) {
      return { versions, nextCursor: null, locked: lockFor(input.since) };
    }
    if (versions.length === input.limit) {
      return { versions, nextCursor: versions[versions.length - 1].version, locked: null };
    }
    versions.push({
      id: row.id,
      version: row.version,
      title: row.title,
      contentEncrypted: row.contentEncrypted,
      source: row.source,
      editorUserId: row.editedBy ?? row.authorId,
      createdAt: row.createdAt.toISOString(),
      isCurrent,
    });
  }
  return { versions, nextCursor: null, locked: null };
}
