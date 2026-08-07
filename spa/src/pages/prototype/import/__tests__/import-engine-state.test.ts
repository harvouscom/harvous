/**
 * The import queue's scheduling rules. These are the behaviours a user notices when
 * they go wrong: work starting twice, a stopped import quietly continuing, a
 * rate-limit pause turning into a hammering loop, or a bar that goes backwards.
 */
import { describe, it, expect } from 'vitest';
import {
  IMPORT_BATCH,
  IMPORT_CONCURRENCY,
  importEngineReducer,
  initialImportEngineState,
  selectCommitBatch,
  selectContainerPhase,
  selectEnrichBatch,
  selectIsRunComplete,
  selectProgressCounts,
  selectUploadCandidates,
  type ImportEngineState,
} from '../import-engine-state';
import type { ImportFileSource } from '../import-file-sources';
import type { ImportItemSummary } from '../import-session-api';

function source(id: string, name: string, size: number): ImportFileSource {
  return {
    id,
    name,
    size,
    extension: name.split('.').pop() ?? 'md',
    folderPath: null,
    path: name,
    fromArchive: null,
    file: async () => new File([''], name),
  };
}

function itemSummary(itemId: string, overrides: Partial<ImportItemSummary> = {}): ImportItemSummary {
  return {
    itemId,
    clientFileId: null,
    fileName: 'note.md',
    title: 'A note',
    folderPath: null,
    primaryCollection: null,
    highlightCount: 0,
    tagCount: 0,
    sourceType: 'md',
    status: 'parsed',
    duplicateHint: null,
    resultNoteId: null,
    enriched: false,
    error: null,
    ...overrides,
  };
}

function reduce(state: ImportEngineState, ...actions: Parameters<typeof importEngineReducer>[1][]) {
  return actions.reduce(importEngineReducer, state);
}

/** A session with one file that parsed into `count` notes, ready to import. */
function parsedState(count = 2): ImportEngineState {
  return reduce(
    initialImportEngineState,
    { type: 'session-ready', sessionId: 'impsess_1' },
    { type: 'add-files', sources: [source('row1', 'notes.md', 100)] },
    {
      type: 'upload-done',
      rowId: 'row1',
      items: Array.from({ length: count }, (_, i) => itemSummary(`item${i + 1}`)),
      warnings: [],
    },
  );
}

describe('upload scheduling', () => {
  it('starts the smallest files first', () => {
    const state = reduce(
      initialImportEngineState,
      { type: 'session-ready', sessionId: 'impsess_1' },
      {
        type: 'add-files',
        sources: [source('big', 'big.md', 9000), source('small', 'small.md', 10), source('mid', 'mid.md', 500)],
      },
    );
    expect(selectUploadCandidates(state).map((row) => row.id)).toEqual(['small', 'mid', 'big']);
  });

  it('never exceeds the upload concurrency limit', () => {
    const sources = Array.from({ length: 8 }, (_, i) => source(`row${i}`, `note${i}.md`, i));
    const state = reduce(
      initialImportEngineState,
      { type: 'session-ready', sessionId: 'impsess_1' },
      { type: 'add-files', sources },
    );
    expect(selectUploadCandidates(state)).toHaveLength(IMPORT_CONCURRENCY.upload);

    const oneRunning = importEngineReducer(state, { type: 'upload-start', rowId: 'row0' });
    expect(selectUploadCandidates(oneRunning)).toHaveLength(IMPORT_CONCURRENCY.upload - 1);
  });

  it('waits for a session before uploading anything', () => {
    const state = importEngineReducer(initialImportEngineState, {
      type: 'add-files',
      sources: [source('row1', 'a.md', 1)],
    });
    expect(selectUploadCandidates(state)).toEqual([]);
  });

  it('ignores a file that was already added', () => {
    const state = reduce(
      initialImportEngineState,
      { type: 'session-ready', sessionId: 'impsess_1' },
      { type: 'add-files', sources: [source('row1', 'a.md', 1)] },
      { type: 'add-files', sources: [source('row2', 'a.md', 1)] },
    );
    expect(state.rows).toHaveLength(1);
  });

  it('marks a file with no readable content rather than leaving it pending', () => {
    const state = reduce(
      initialImportEngineState,
      { type: 'session-ready', sessionId: 'impsess_1' },
      { type: 'add-files', sources: [source('row1', 'empty.pdf', 10)] },
      { type: 'upload-done', rowId: 'row1', items: [], warnings: [] },
    );
    expect(state.rows[0].phase).toBe('unsupported');
  });

  it('joins a file dropped mid-run to the run in progress', () => {
    const running = reduce(parsedState(1), { type: 'start-import' }, {
      type: 'add-files',
      sources: [source('row2', 'later.md', 5)],
    });
    const withUpload = importEngineReducer(running, {
      type: 'upload-done',
      rowId: 'row2',
      items: [itemSummary('item9')],
      warnings: [],
    });
    expect(withUpload.rows.find((row) => row.id === 'row2')?.phase).toBe('commit-queued');
  });
});

describe('commit scheduling', () => {
  it('commits nothing until the user starts the import', () => {
    expect(selectCommitBatch(parsedState())).toEqual([]);
  });

  it('batches parsed items once the import starts', () => {
    const state = importEngineReducer(parsedState(3), { type: 'start-import' });
    expect(selectCommitBatch(state)).toEqual(['item1', 'item2', 'item3']);
  });

  it('caps a batch at the batch size', () => {
    const state = importEngineReducer(parsedState(IMPORT_BATCH.commit + 5), { type: 'start-import' });
    expect(selectCommitBatch(state)).toHaveLength(IMPORT_BATCH.commit);
  });

  it('skips items the user excluded', () => {
    const state = reduce(
      parsedState(2),
      { type: 'toggle-include', rowId: 'row1', included: false },
      { type: 'start-import' },
    );
    expect(selectCommitBatch(state)).toEqual([]);
  });

  it('holds the whole queue while a rate-limit window is open', () => {
    const now = 1_000_000;
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1'] }, {
      type: 'commit-result',
      itemIds: ['item1'],
      results: [],
      rateLimited: { retryAfterSeconds: 30, message: 'Slow down' },
    });
    expect(selectCommitBatch(state, Date.now() + 1000)).toEqual([]);
    expect(selectCommitBatch({ ...state, rateLimitedUntil: now }, now + 5000).length).toBeGreaterThan(0);
  });

  it('returns items the server never reached to the queue', () => {
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1', 'item2'] }, {
      type: 'commit-result',
      itemIds: ['item1', 'item2'],
      results: [{ itemId: 'item1', status: 'committed', noteId: 'note_1' }],
      rateLimited: { retryAfterSeconds: 5, message: 'Slow down' },
    });
    expect(state.items.item2.status).toBe('parsed');
  });
});

describe('stop and continue', () => {
  it('puts queued work back to waiting and stops scheduling', () => {
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'pause' });
    expect(state.rows[0].phase).toBe('parsed');
    expect(selectCommitBatch(state)).toEqual([]);
    expect(selectContainerPhase(state)).toBe('paused');
  });

  it('picks up exactly where it stopped', () => {
    const state = reduce(
      parsedState(2),
      { type: 'start-import' },
      { type: 'commit-start', itemIds: ['item1'] },
      { type: 'commit-result', itemIds: ['item1'], results: [{ itemId: 'item1', status: 'committed', noteId: 'n1' }] },
      { type: 'pause' },
      { type: 'resume' },
    );
    expect(selectCommitBatch(state)).toEqual(['item2']);
  });

  it('returns an in-flight commit to the queue when stopped', () => {
    const state = reduce(parsedState(1), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1'] }, { type: 'pause' });
    expect(state.items.item1.status).toBe('parsed');
  });
});

describe('enrichment', () => {
  it('enriches committed notes one batch at a time', () => {
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1', 'item2'] }, {
      type: 'commit-result',
      itemIds: ['item1', 'item2'],
      results: [
        { itemId: 'item1', status: 'committed', noteId: 'n1' },
        { itemId: 'item2', status: 'committed', noteId: 'n2' },
      ],
    });
    expect(selectEnrichBatch(state)).toEqual(['item1', 'item2']);

    const running = importEngineReducer(state, { type: 'enrich-start', itemIds: ['item1', 'item2'] });
    expect(selectEnrichBatch(running)).toEqual([]);
  });

  it('does not enrich duplicates or failures', () => {
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1', 'item2'] }, {
      type: 'commit-result',
      itemIds: ['item1', 'item2'],
      results: [
        { itemId: 'item1', status: 'duplicate', noteId: 'existing' },
        { itemId: 'item2', status: 'failed', error: 'nope' },
      ],
    });
    expect(selectEnrichBatch(state)).toEqual([]);
  });

  it('completes the row even when enrichment fails', () => {
    const state = reduce(parsedState(1), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1'] }, {
      type: 'commit-result',
      itemIds: ['item1'],
      results: [{ itemId: 'item1', status: 'committed', noteId: 'n1' }],
    }, { type: 'enrich-start', itemIds: ['item1'] }, { type: 'enrich-failed', itemIds: ['item1'] });

    expect(state.rows[0].phase).toBe('done');
    expect(state.rows[0].progress).toBe(1);
  });
});

describe('row progress', () => {
  it('never goes backwards as a multi-note file works through its notes', () => {
    let state = importEngineReducer(parsedState(4), { type: 'start-import' });
    const seen: number[] = [state.rows[0].progress];

    for (const itemId of ['item1', 'item2', 'item3', 'item4']) {
      state = reduce(state, { type: 'commit-start', itemIds: [itemId] }, {
        type: 'commit-result',
        itemIds: [itemId],
        results: [{ itemId, status: 'committed', noteId: `n_${itemId}` }],
      });
      seen.push(state.rows[0].progress);
    }
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    // Commit fills three quarters; the rest belongs to enrichment.
    expect(state.rows[0].progress).toBeCloseTo(0.75, 5);
  });

  it('reaches exactly 1 only when everything is settled and enriched', () => {
    const state = reduce(parsedState(1), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1'] }, {
      type: 'commit-result',
      itemIds: ['item1'],
      results: [{ itemId: 'item1', status: 'committed', noteId: 'n1' }],
    });
    expect(state.rows[0].progress).toBeLessThan(1);

    const enriched = reduce(state, { type: 'enrich-start', itemIds: ['item1'] }, { type: 'enrich-result', itemIds: ['item1'] });
    expect(enriched.rows[0].progress).toBe(1);
  });

  it('labels a file whose notes all already exist as a duplicate', () => {
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1', 'item2'] }, {
      type: 'commit-result',
      itemIds: ['item1', 'item2'],
      results: [
        { itemId: 'item1', status: 'duplicate', noteId: 'a' },
        { itemId: 'item2', status: 'duplicate', noteId: 'b' },
      ],
    });
    expect(state.rows[0].phase).toBe('duplicate');
  });

  it('keeps a partly-failed file marked done, with the shortfall named', () => {
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1', 'item2'] }, {
      type: 'commit-result',
      itemIds: ['item1', 'item2'],
      results: [
        { itemId: 'item1', status: 'committed', noteId: 'a' },
        { itemId: 'item2', status: 'failed', error: 'boom' },
      ],
    }, { type: 'enrich-start', itemIds: ['item1'] }, { type: 'enrich-result', itemIds: ['item1'] });

    expect(state.rows[0].phase).toBe('done');
    expect(state.rows[0].subLabel).toBe("1 of 2 didn't import");
  });
});

describe('run completion', () => {
  it('is not complete while a file is still uploading', () => {
    const state = reduce(
      parsedState(1),
      { type: 'start-import' },
      { type: 'add-files', sources: [source('row2', 'later.md', 5)] },
    );
    expect(selectIsRunComplete(state)).toBe(false);
  });

  it('is complete once every item has settled and enriched', () => {
    const state = reduce(parsedState(2), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1', 'item2'] }, {
      type: 'commit-result',
      itemIds: ['item1', 'item2'],
      results: [
        { itemId: 'item1', status: 'committed', noteId: 'n1' },
        { itemId: 'item2', status: 'duplicate', noteId: 'n2' },
      ],
    }, { type: 'enrich-start', itemIds: ['item1'] }, { type: 'enrich-result', itemIds: ['item1'] });

    expect(selectIsRunComplete(state)).toBe(true);
  });

  it('counts what landed', () => {
    const state = reduce(parsedState(3), { type: 'start-import' }, { type: 'commit-start', itemIds: ['item1', 'item2', 'item3'] }, {
      type: 'commit-result',
      itemIds: ['item1', 'item2', 'item3'],
      results: [
        { itemId: 'item1', status: 'committed', noteId: 'n1' },
        { itemId: 'item2', status: 'duplicate', noteId: 'n2' },
        { itemId: 'item3', status: 'failed', error: 'boom' },
      ],
    });
    expect(selectProgressCounts(state)).toMatchObject({
      totalItems: 3,
      settledItems: 3,
      imported: 1,
      duplicates: 1,
      failed: 1,
    });
  });
});

describe('container phase', () => {
  it('walks from idle through review to done', () => {
    expect(selectContainerPhase(initialImportEngineState)).toBe('idle');

    const adding = reduce(
      initialImportEngineState,
      { type: 'session-ready', sessionId: 's' },
      { type: 'add-files', sources: [source('row1', 'a.md', 1)] },
    );
    expect(selectContainerPhase(adding)).toBe('adding');

    const review = parsedState(1);
    expect(selectContainerPhase(review)).toBe('review');

    const importing = importEngineReducer(review, { type: 'start-import' });
    expect(selectContainerPhase(importing)).toBe('importing');

    const done = importEngineReducer(importing, {
      type: 'finalized',
      summary: {
        notesImported: 1,
        duplicatesSkipped: 0,
        highlightsImported: 0,
        connectionsImported: 0,
        scriptureProcessed: 0,
        autoTagsApplied: 0,
      },
    });
    expect(selectContainerPhase(done)).toBe('done');
  });
});
