import { FREE_HISTORY_WINDOW_DAYS } from '@/lib/billing-plans';
import { NOTE_VERSION_SAVE_COALESCE_MS } from './note-versioning';

const DAY_MS = 24 * 60 * 60 * 1000;

export const NOTE_VERSION_RETENTION_LATEST_COUNT = 100;
// Tied to the free window so thinning can never remove a version a free account can still see.
export const NOTE_VERSION_RETENTION_MAX_AGE_MS = FREE_HISTORY_WINDOW_DAYS * DAY_MS;
export const NOTE_VERSION_THIN_SCAN_LIMIT = 2000;
export const NOTE_VERSION_THIN_DELETE_LIMIT = 500;

const THINNABLE_SOURCES: ReadonlySet<string> = new Set(['save', 'sync-update']);

export function isThinnableNoteVersionSource(source: string | null | undefined): boolean {
  return source != null && THINNABLE_SOURCES.has(source);
}

export function isProtectedNoteVersion(input: {
  id: string;
  version: number;
  source: string | null;
  currentVersionId: string | null;
  referencedVersionIds: ReadonlySet<string>;
}): boolean {
  return (
    input.id === input.currentVersionId ||
    input.version === 1 ||
    input.source === 'restore' ||
    input.referencedVersionIds.has(input.id)
  );
}

export type SessionCheckpoint = {
  source: string | null;
  createdAt: Date;
  editorId: string;
};

export type ThinningVersionRow = SessionCheckpoint & {
  id: string;
  version: number;
};

function continuesSession(previous: SessionCheckpoint, next: SessionCheckpoint, gapMs: number): boolean {
  const gap = next.createdAt.getTime() - previous.createdAt.getTime();
  return (
    isThinnableNoteVersionSource(previous.source) &&
    isThinnableNoteVersionSource(next.source) &&
    previous.editorId === next.editorId &&
    gap >= 0 &&
    gap < gapMs
  );
}

export function startsNewEditingSession(input: {
  previous: SessionCheckpoint;
  next: SessionCheckpoint;
  gapMs?: number;
}): boolean {
  return !continuesSession(input.previous, input.next, input.gapMs ?? NOTE_VERSION_SAVE_COALESCE_MS);
}

/**
 * Ids of old routine checkpoints that a later checkpoint in the same session supersedes.
 * Every session keeps its last checkpoint; the newest `oldestProtectedVersion`+ rows are untouched.
 */
export function planNoteVersionThinning(input: {
  rows: readonly ThinningVersionRow[];
  now: Date;
  currentVersionId: string | null;
  oldestProtectedVersion: number;
  referencedVersionIds: ReadonlySet<string>;
  limit?: number;
  gapMs?: number;
  maxAgeMs?: number;
}): string[] {
  const cutoff = input.now.getTime() - (input.maxAgeMs ?? NOTE_VERSION_RETENTION_MAX_AGE_MS);
  const gapMs = input.gapMs ?? NOTE_VERSION_SAVE_COALESCE_MS;
  const limit = input.limit ?? Number.POSITIVE_INFINITY;
  const sorted = [...input.rows].sort((left, right) => left.version - right.version);
  const removable: string[] = [];

  for (let index = 0; index < sorted.length - 1 && removable.length < limit; index += 1) {
    const row = sorted[index];
    const next = sorted[index + 1];
    // Replaced inside the window means a free account can still open it.
    if (next.createdAt.getTime() >= cutoff) continue;
    if (row.version >= input.oldestProtectedVersion) continue;
    if (
      isProtectedNoteVersion({
        ...row,
        currentVersionId: input.currentVersionId,
        referencedVersionIds: input.referencedVersionIds,
      })
    ) {
      continue;
    }
    if (!continuesSession(row, next, gapMs)) continue;
    removable.push(row.id);
  }

  return removable;
}
