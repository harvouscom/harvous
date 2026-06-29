import { describe, expect, it } from 'vitest';
import { deriveReferenceWordConnections } from '@/utils/prototype-home-trends';
import { studyThreadEligibleForHighlightList } from '@/utils/study-thread-highlight-eligibility';

/** Mirrors the row shape mapped in build-space-reference-word-connections.ts */
function mapEligibleReferenceRows(
  rows: Array<{
    id: string;
    entryKindRaw: string;
    sourceSnippet?: string | null;
    anchorTextSnapshot?: string | null;
    focusTitle?: string | null;
    parentNoteId: string;
    highlightListEditedAt?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
    scripturePassageExcerpt?: string | null;
    anchorLocation?: number | null;
    anchorLength?: number | null;
    linkedNoteId?: string | null;
  }>,
) {
  const eligible = rows.filter((row) => studyThreadEligibleForHighlightList(row));
  return eligible.map((row) => ({
    id: row.id,
    entryKind: 'reference',
    sourceSnippet: row.sourceSnippet,
    anchorTextSnapshot: row.anchorTextSnapshot,
    focusTitle: row.focusTitle,
    parentNoteId: row.parentNoteId,
    recencyMs: Date.parse(String(row.highlightListEditedAt ?? row.updatedAt ?? row.createdAt ?? '')) || 0,
  }));
}

describe('build-space-reference-word-connections mapping', () => {
  it('derives connections from eligible reference study-thread rows', () => {
    const inputs = mapEligibleReferenceRows([
      {
        id: 'r1',
        entryKindRaw: 'reference',
        sourceSnippet: 'Aaron',
        parentNoteId: 'n1',
        scripturePassageExcerpt: 'And Aaron…',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'r2',
        entryKindRaw: 'reference',
        sourceSnippet: 'Aaron',
        parentNoteId: 'n2',
        scripturePassageExcerpt: 'Then Aaron…',
        createdAt: '2024-02-01T00:00:00.000Z',
      },
    ]);

    const connections = deriveReferenceWordConnections(inputs, { limit: 3, minNotes: 2 });
    expect(connections).toHaveLength(1);
    expect(connections[0]?.displayWord).toBe('Aaron');
    expect(connections[0]?.noteCount).toBe(2);
    expect(connections[0]?.latestRowId).toBe('r2');
  });

  it('drops ineligible reference rows without passage excerpt or snippet', () => {
    const inputs = mapEligibleReferenceRows([
      {
        id: 'r1',
        entryKindRaw: 'reference',
        sourceSnippet: '',
        parentNoteId: 'n1',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    expect(deriveReferenceWordConnections(inputs, { limit: 1, minNotes: 2 })).toEqual([]);
  });
});
