/**
 * The feed's first-paint snapshot, and the two ways it must fail closed.
 *
 * The snapshot exists so a reload paints yesterday's feed instead of loading dots; these
 * pin the guards around that. A snapshot from an older build (version mismatch) and a
 * corrupted one must both read as "no snapshot" — the cost of dropping one is a second of
 * dots, the cost of trusting one is rendering items in whatever shape they used to have.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFeedSnapshot, writeFeedSnapshot } from '../useStudyFeed';
import type { StudyFeedResponse } from '@/utils/study-feed-items';

const page: StudyFeedResponse = {
  items: [
    {
      id: 'note-created:n1',
      kind: 'note-created',
      at: '2026-08-29T12:00:00.000Z',
      noteId: 'n1',
      title: 'A note',
      snippet: '',
      scriptureRefs: [],
    },
  ],
  nextCursor: null,
} as unknown as StudyFeedResponse;

beforeEach(() => sessionStorage.clear());

describe('the round trip', () => {
  it('hands back what was written, per scope', () => {
    writeFeedSnapshot('all', page);
    expect(readFeedSnapshot('all')?.items).toHaveLength(1);
    // A scoped feed does not leak into the default one.
    expect(readFeedSnapshot('home')).toBeUndefined();
  });
});

describe('failing closed', () => {
  it('reads nothing when nothing was written', () => {
    expect(readFeedSnapshot('all')).toBeUndefined();
  });

  it('drops a snapshot from a different version', () => {
    sessionStorage.setItem(
      'harvous-study-feed-snapshot-all',
      JSON.stringify({ v: 999, page }),
    );
    expect(readFeedSnapshot('all')).toBeUndefined();
  });

  it('drops one whose items are not a list', () => {
    sessionStorage.setItem(
      'harvous-study-feed-snapshot-all',
      JSON.stringify({ v: 1, page: { items: 'nope' } }),
    );
    expect(readFeedSnapshot('all')).toBeUndefined();
  });

  it('survives raw garbage in the slot', () => {
    sessionStorage.setItem('harvous-study-feed-snapshot-all', '{not json');
    expect(readFeedSnapshot('all')).toBeUndefined();
  });
});
