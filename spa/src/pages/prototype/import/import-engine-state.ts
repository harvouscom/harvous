/**
 * The import queue as pure state: a reducer plus the selectors that decide what to
 * work on next. All of the scheduling judgement lives here — which files upload
 * next, how big a commit batch is, when the queue has to wait out a rate limit —
 * so the hook around it only has to perform the requests.
 *
 * Two levels of state, deliberately: a row per file the user dropped, and an item
 * per note that file parsed into. They are not 1:1 — one `.enex` or `.csv` is a
 * whole notebook — and pretending otherwise is what makes progress lie.
 */
import type { ImportFileSource } from './import-file-sources';
import type { ImportItemSummary } from './import-session-api';

export const IMPORT_CONCURRENCY = {
  /** Uploads in flight. Enough to keep the connection busy without starving the UI. */
  upload: 3,
  /** Commit requests in flight; each writes notes in a transaction. */
  commit: 2,
  /** Enrich requests in flight. The server serializes scripture work per user anyway. */
  enrich: 1,
} as const;

export const IMPORT_BATCH = {
  commit: 8,
  enrich: 5,
} as const;

export type RowPhase =
  | 'queued'
  | 'uploading'
  | 'parsing'
  | 'parsed'
  | 'unsupported'
  | 'parse-failed'
  | 'commit-queued'
  | 'committing'
  | 'enriching'
  | 'done'
  | 'duplicate'
  | 'failed';

export type ItemStatus =
  | 'parsed'
  | 'excluded'
  | 'committing'
  | 'committed'
  | 'duplicate'
  | 'failed'
  | 'enriching'
  | 'enriched';

export interface ImportItemState {
  itemId: string;
  rowId: string;
  title: string;
  primaryCollection: string | null;
  highlightCount: number;
  tagCount: number;
  duplicateHint: string | null;
  status: ItemStatus;
  noteId: string | null;
  error: string | null;
}

export interface ImportRowState {
  id: string;
  name: string;
  size: number;
  extension: string;
  folderPath: string | null;
  path: string;
  fromArchive: string | null;
  phase: RowPhase;
  /** 0–1 within the row's current stage. */
  progress: number;
  subLabel: string | null;
  included: boolean;
  itemIds: string[];
  error: string | null;
  attempts: number;
}

export interface ImportEngineState {
  sessionId: string | null;
  rows: ImportRowState[];
  items: Record<string, ImportItemState>;
  /** Set once the user hits Import; the commit/enrich phases only run then. */
  importing: boolean;
  paused: boolean;
  /** Epoch ms until which the whole queue waits out a server rate limit. */
  rateLimitedUntil: number | null;
  rateLimitMessage: string | null;
  finalized: boolean;
  summary: {
    notesImported: number;
    duplicatesSkipped: number;
    highlightsImported: number;
    connectionsImported: number;
    scriptureProcessed: number;
    autoTagsApplied: number;
  } | null;
  notices: string[];
  manifestConnections: Array<{ fromNoteId: string; toNoteId: string }>;
  uploadsInFlight: number;
  commitsInFlight: number;
  enrichInFlight: number;
}

export const initialImportEngineState: ImportEngineState = {
  sessionId: null,
  rows: [],
  items: {},
  importing: false,
  paused: false,
  rateLimitedUntil: null,
  rateLimitMessage: null,
  finalized: false,
  summary: null,
  notices: [],
  manifestConnections: [],
  uploadsInFlight: 0,
  commitsInFlight: 0,
  enrichInFlight: 0,
};

export type ImportEngineAction =
  | { type: 'session-ready'; sessionId: string }
  | { type: 'add-files'; sources: ImportFileSource[]; notices?: string[]; manifestConnections?: Array<{ fromNoteId: string; toNoteId: string }> }
  | { type: 'manifest-sent' }
  | { type: 'upload-start'; rowId: string }
  | { type: 'upload-progress'; rowId: string; fraction: number }
  | { type: 'upload-parsing'; rowId: string }
  | { type: 'upload-done'; rowId: string; items: ImportItemSummary[]; warnings: string[] }
  | { type: 'upload-failed'; rowId: string; error: string }
  | { type: 'row-retry'; rowId: string }
  | { type: 'row-remove'; rowId: string }
  | { type: 'toggle-include'; rowId: string; included: boolean }
  | { type: 'set-all-included'; included: boolean }
  | { type: 'start-import' }
  | { type: 'commit-start'; itemIds: string[] }
  | { type: 'commit-result'; itemIds: string[]; results: Array<{ itemId: string; status: 'committed' | 'duplicate' | 'failed'; noteId?: string; error?: string }>; rateLimited?: { retryAfterSeconds: number; message: string } }
  | { type: 'commit-failed'; itemIds: string[]; error: string }
  | { type: 'enrich-start'; itemIds: string[] }
  | { type: 'enrich-result'; itemIds: string[] }
  | { type: 'enrich-failed'; itemIds: string[] }
  | { type: 'clear-rate-limit' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'finalized'; summary: NonNullable<ImportEngineState['summary']> }
  | { type: 'notice'; messages: string[] }
  | { type: 'reset' };

function rowFromSource(source: ImportFileSource): ImportRowState {
  return {
    id: source.id,
    name: source.name,
    size: source.size,
    extension: source.extension,
    folderPath: source.folderPath,
    path: source.path,
    fromArchive: source.fromArchive,
    phase: 'queued',
    progress: 0,
    subLabel: null,
    included: true,
    itemIds: [],
    error: null,
    attempts: 0,
  };
}

function patchRow(
  state: ImportEngineState,
  rowId: string,
  patch: Partial<ImportRowState> | ((row: ImportRowState) => Partial<ImportRowState>),
): ImportEngineState {
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.id === rowId ? { ...row, ...(typeof patch === 'function' ? patch(row) : patch) } : row,
    ),
  };
}

/**
 * A row's stage-B phase and progress are read off its items rather than tracked
 * separately, so the two can't disagree. Commit fills the first 75% of the bar and
 * enrichment the rest — one bar per file that only ever moves forward.
 */
function recomputeRowFromItems(state: ImportEngineState, rowId: string): ImportEngineState {
  const row = state.rows.find((r) => r.id === rowId);
  if (!row || row.itemIds.length === 0) return state;

  const items = row.itemIds.map((id) => state.items[id]).filter(Boolean);
  const active = items.filter((item) => item.status !== 'excluded');
  if (active.length === 0) return patchRow(state, rowId, { phase: 'parsed', progress: 0, subLabel: null });

  const committed = active.filter((i) => i.status === 'committed' || i.status === 'enriching' || i.status === 'enriched').length;
  const duplicates = active.filter((i) => i.status === 'duplicate').length;
  const failed = active.filter((i) => i.status === 'failed').length;
  const enriched = active.filter((i) => i.status === 'enriched').length;
  const settled = committed + duplicates + failed;

  const commitFraction = settled / active.length;
  const enrichFraction = committed > 0 ? enriched / committed : 1;
  const progress = commitFraction * 0.75 + (settled === active.length ? enrichFraction * 0.25 : 0);

  if (settled < active.length) {
    const inFlight = active.some((i) => i.status === 'committing');
    return patchRow(state, rowId, {
      phase: inFlight ? 'committing' : 'commit-queued',
      progress,
      subLabel:
        active.length > 1 ? `Creating ${Math.min(settled + 1, active.length)} of ${active.length}…` : 'Creating note…',
    });
  }

  if (committed > 0 && enriched < committed) {
    return patchRow(state, rowId, {
      phase: 'enriching',
      progress,
      subLabel: 'Linking scripture…',
    });
  }

  // Everything settled. Failures win the badge, then duplicates, then success.
  if (failed === active.length) {
    return patchRow(state, rowId, {
      phase: 'failed',
      progress: 1,
      subLabel: null,
      error: items.find((i) => i.error)?.error ?? 'Import failed',
    });
  }
  if (duplicates === active.length) {
    return patchRow(state, rowId, { phase: 'duplicate', progress: 1, subLabel: null });
  }
  return patchRow(state, rowId, {
    phase: 'done',
    progress: 1,
    subLabel: failed > 0 ? `${failed} of ${active.length} didn't import` : null,
  });
}

export function importEngineReducer(
  state: ImportEngineState,
  action: ImportEngineAction,
): ImportEngineState {
  switch (action.type) {
    case 'session-ready':
      return { ...state, sessionId: action.sessionId };

    case 'add-files': {
      const known = new Set(state.rows.map((row) => row.path));
      const fresh = action.sources.filter((source) => !known.has(source.path));
      return {
        ...state,
        rows: [...state.rows, ...fresh.map(rowFromSource)],
        notices: [...state.notices, ...(action.notices ?? [])],
        manifestConnections: [...state.manifestConnections, ...(action.manifestConnections ?? [])],
        // Adding files after a finished run starts a new run, not a second summary.
        finalized: false,
        summary: null,
      };
    }

    case 'manifest-sent':
      return { ...state, manifestConnections: [] };

    case 'upload-start':
      return patchRow(
        { ...state, uploadsInFlight: state.uploadsInFlight + 1 },
        action.rowId,
        (row) => ({ phase: 'uploading', progress: 0, error: null, attempts: row.attempts + 1 }),
      );

    case 'upload-progress':
      return patchRow(state, action.rowId, (row) =>
        row.phase === 'uploading' ? { progress: Math.max(row.progress, action.fraction) } : {},
      );

    case 'upload-parsing':
      return patchRow(state, action.rowId, { phase: 'parsing', progress: 1, subLabel: 'Reading…' });

    case 'upload-done': {
      const items: Record<string, ImportItemState> = { ...state.items };
      for (const summary of action.items) {
        items[summary.itemId] = {
          itemId: summary.itemId,
          rowId: action.rowId,
          title: summary.title,
          primaryCollection: summary.primaryCollection,
          highlightCount: summary.highlightCount,
          tagCount: summary.tagCount,
          duplicateHint: summary.duplicateHint,
          status: 'parsed',
          noteId: summary.resultNoteId,
          error: null,
        };
      }
      const next: ImportEngineState = {
        ...state,
        items,
        uploadsInFlight: Math.max(0, state.uploadsInFlight - 1),
        notices: [...state.notices, ...action.warnings],
      };
      // Files dropped after Import was pressed join the run instead of waiting for
      // a second confirmation the user has no reason to expect.
      const joinsRunningImport = state.importing && !state.paused;
      return patchRow(next, action.rowId, {
        phase:
          action.items.length === 0 ? 'unsupported' : joinsRunningImport ? 'commit-queued' : 'parsed',
        progress: 0,
        subLabel: null,
        itemIds: action.items.map((item) => item.itemId),
        error: action.items.length === 0 ? 'Nothing we could read in this file' : null,
      });
    }

    case 'upload-failed':
      return patchRow(
        { ...state, uploadsInFlight: Math.max(0, state.uploadsInFlight - 1) },
        action.rowId,
        { phase: 'parse-failed', progress: 0, subLabel: null, error: action.error },
      );

    case 'row-retry':
      return patchRow(state, action.rowId, { phase: 'queued', progress: 0, error: null, subLabel: null });

    case 'row-remove': {
      const row = state.rows.find((r) => r.id === action.rowId);
      const items = { ...state.items };
      for (const itemId of row?.itemIds ?? []) delete items[itemId];
      return { ...state, rows: state.rows.filter((r) => r.id !== action.rowId), items };
    }

    case 'toggle-include':
    case 'set-all-included': {
      const targetRows =
        action.type === 'toggle-include'
          ? state.rows.filter((row) => row.id === action.rowId)
          : state.rows.filter((row) => row.phase === 'parsed');
      const targetIds = new Set(targetRows.map((row) => row.id));
      const items = { ...state.items };
      for (const item of Object.values(state.items)) {
        if (!targetIds.has(item.rowId)) continue;
        if (item.status !== 'parsed' && item.status !== 'excluded') continue;
        items[item.itemId] = { ...item, status: action.included ? 'parsed' : 'excluded' };
      }
      return {
        ...state,
        items,
        rows: state.rows.map((row) =>
          targetIds.has(row.id) ? { ...row, included: action.included } : row,
        ),
      };
    }

    case 'start-import':
      return {
        ...state,
        importing: true,
        paused: false,
        finalized: false,
        summary: null,
        rows: state.rows.map((row) =>
          row.phase === 'parsed' && row.included ? { ...row, phase: 'commit-queued', progress: 0 } : row,
        ),
      };

    case 'commit-start': {
      const items = { ...state.items };
      for (const itemId of action.itemIds) {
        const item = items[itemId];
        if (item) items[itemId] = { ...item, status: 'committing' };
      }
      let next: ImportEngineState = { ...state, items, commitsInFlight: state.commitsInFlight + 1 };
      for (const rowId of new Set(action.itemIds.map((id) => state.items[id]?.rowId).filter(Boolean))) {
        next = recomputeRowFromItems(next, rowId as string);
      }
      return next;
    }

    case 'commit-result': {
      const items = { ...state.items };
      for (const result of action.results) {
        const item = items[result.itemId];
        if (!item) continue;
        items[result.itemId] = {
          ...item,
          status: result.status,
          noteId: result.noteId ?? item.noteId,
          error: result.error ?? null,
        };
      }
      // Items the server didn't reach (a rate-limit pause mid-batch) go back in the queue.
      const answered = new Set(action.results.map((r) => r.itemId));
      for (const itemId of action.itemIds) {
        if (answered.has(itemId)) continue;
        const item = items[itemId];
        if (item?.status === 'committing') items[itemId] = { ...item, status: 'parsed' };
      }

      let next: ImportEngineState = {
        ...state,
        items,
        commitsInFlight: Math.max(0, state.commitsInFlight - 1),
        rateLimitedUntil: action.rateLimited
          ? Date.now() + action.rateLimited.retryAfterSeconds * 1000
          : state.rateLimitedUntil,
        rateLimitMessage: action.rateLimited ? action.rateLimited.message : state.rateLimitMessage,
      };
      for (const rowId of new Set(action.itemIds.map((id) => state.items[id]?.rowId).filter(Boolean))) {
        next = recomputeRowFromItems(next, rowId as string);
      }
      return next;
    }

    case 'commit-failed': {
      const items = { ...state.items };
      for (const itemId of action.itemIds) {
        const item = items[itemId];
        if (item) items[itemId] = { ...item, status: 'failed', error: action.error };
      }
      let next: ImportEngineState = {
        ...state,
        items,
        commitsInFlight: Math.max(0, state.commitsInFlight - 1),
      };
      for (const rowId of new Set(action.itemIds.map((id) => state.items[id]?.rowId).filter(Boolean))) {
        next = recomputeRowFromItems(next, rowId as string);
      }
      return next;
    }

    case 'enrich-start': {
      const items = { ...state.items };
      for (const itemId of action.itemIds) {
        const item = items[itemId];
        if (item) items[itemId] = { ...item, status: 'enriching' };
      }
      let next: ImportEngineState = { ...state, items, enrichInFlight: state.enrichInFlight + 1 };
      for (const rowId of new Set(action.itemIds.map((id) => state.items[id]?.rowId).filter(Boolean))) {
        next = recomputeRowFromItems(next, rowId as string);
      }
      return next;
    }

    case 'enrich-result':
    case 'enrich-failed': {
      // Either way the note is saved; enrichment is not allowed to fail a row.
      const items = { ...state.items };
      for (const itemId of action.itemIds) {
        const item = items[itemId];
        if (item) items[itemId] = { ...item, status: 'enriched' };
      }
      let next: ImportEngineState = {
        ...state,
        items,
        enrichInFlight: Math.max(0, state.enrichInFlight - 1),
      };
      for (const rowId of new Set(action.itemIds.map((id) => state.items[id]?.rowId).filter(Boolean))) {
        next = recomputeRowFromItems(next, rowId as string);
      }
      return next;
    }

    case 'clear-rate-limit':
      return { ...state, rateLimitedUntil: null, rateLimitMessage: null };

    case 'pause': {
      // In-flight work can't be un-sent, but anything merely queued goes back to
      // waiting so Continue picks up exactly where the user stopped it.
      const items = { ...state.items };
      for (const item of Object.values(state.items)) {
        if (item.status === 'committing') items[item.itemId] = { ...item, status: 'parsed' };
      }
      return {
        ...state,
        paused: true,
        items,
        rows: state.rows.map((row) =>
          row.phase === 'commit-queued' ? { ...row, phase: 'parsed', progress: 0, subLabel: null } : row,
        ),
      };
    }

    case 'resume':
      return {
        ...state,
        paused: false,
        rows: state.rows.map((row) =>
          row.phase === 'parsed' && row.included ? { ...row, phase: 'commit-queued' } : row,
        ),
      };

    case 'finalized':
      return { ...state, finalized: true, importing: false, summary: action.summary };

    case 'notice':
      return { ...state, notices: [...state.notices, ...action.messages] };

    case 'reset':
      return { ...initialImportEngineState };

    default:
      return state;
  }
}

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Files to start uploading now — smallest first, so early rows finish early. */
export function selectUploadCandidates(state: ImportEngineState): ImportRowState[] {
  if (!state.sessionId) return [];
  const free = IMPORT_CONCURRENCY.upload - state.uploadsInFlight;
  if (free <= 0) return [];
  return state.rows
    .filter((row) => row.phase === 'queued')
    .sort((a, b) => a.size - b.size)
    .slice(0, free);
}

function queueIsWaiting(state: ImportEngineState, now: number): boolean {
  if (!state.importing || state.paused) return true;
  if (state.rateLimitedUntil != null && state.rateLimitedUntil > now) return true;
  return false;
}

/** The next batch of parsed items to write. Empty while paused or rate-limited. */
export function selectCommitBatch(state: ImportEngineState, now: number = Date.now()): string[] {
  if (queueIsWaiting(state, now)) return [];
  if (state.commitsInFlight >= IMPORT_CONCURRENCY.commit) return [];

  const rowOrder = new Map(state.rows.map((row, index) => [row.id, index]));
  return Object.values(state.items)
    .filter((item) => {
      if (item.status !== 'parsed') return false;
      const row = state.rows.find((r) => r.id === item.rowId);
      return !!row && row.included && row.phase !== 'parsed';
    })
    .sort((a, b) => (rowOrder.get(a.rowId) ?? 0) - (rowOrder.get(b.rowId) ?? 0))
    .slice(0, IMPORT_BATCH.commit)
    .map((item) => item.itemId);
}

/** Committed items still waiting on auto-tags and scripture pills. */
export function selectEnrichBatch(state: ImportEngineState, now: number = Date.now()): string[] {
  if (state.paused) return [];
  if (state.rateLimitedUntil != null && state.rateLimitedUntil > now) return [];
  if (state.enrichInFlight >= IMPORT_CONCURRENCY.enrich) return [];
  return Object.values(state.items)
    .filter((item) => item.status === 'committed')
    .slice(0, IMPORT_BATCH.enrich)
    .map((item) => item.itemId);
}

/** True once every included item has been written and enriched. */
export function selectIsRunComplete(state: ImportEngineState): boolean {
  if (!state.importing) return false;
  if (state.uploadsInFlight > 0 || state.commitsInFlight > 0 || state.enrichInFlight > 0) return false;
  if (state.rows.some((row) => row.phase === 'queued' || row.phase === 'uploading' || row.phase === 'parsing')) {
    return false;
  }
  const active = Object.values(state.items).filter((item) => item.status !== 'excluded');
  if (active.length === 0) return false;
  return active.every((item) => item.status === 'enriched' || item.status === 'duplicate' || item.status === 'failed');
}

export interface ImportProgressCounts {
  totalItems: number;
  settledItems: number;
  imported: number;
  duplicates: number;
  failed: number;
  filesPending: number;
}

export function selectProgressCounts(state: ImportEngineState): ImportProgressCounts {
  const active = Object.values(state.items).filter((item) => item.status !== 'excluded');
  const imported = active.filter((i) => i.status === 'committed' || i.status === 'enriching' || i.status === 'enriched').length;
  const duplicates = active.filter((i) => i.status === 'duplicate').length;
  const failed = active.filter((i) => i.status === 'failed').length;
  return {
    totalItems: active.length,
    settledItems: imported + duplicates + failed,
    imported,
    duplicates,
    failed,
    filesPending: state.rows.filter((row) =>
      row.phase === 'queued' || row.phase === 'uploading' || row.phase === 'parsing',
    ).length,
  };
}

export type ImportContainerPhase = 'idle' | 'adding' | 'review' | 'importing' | 'paused' | 'done';

export function selectContainerPhase(state: ImportEngineState): ImportContainerPhase {
  if (state.rows.length === 0) return 'idle';
  if (state.finalized) return 'done';
  if (state.paused) return 'paused';
  if (state.importing) return 'importing';
  if (state.rows.some((row) => row.phase === 'queued' || row.phase === 'uploading' || row.phase === 'parsing')) {
    return 'adding';
  }
  return 'review';
}

/** Items that would be created if the user hit Import right now. */
export function selectReadyItemCount(state: ImportEngineState): number {
  return Object.values(state.items).filter((item) => item.status === 'parsed').length;
}
