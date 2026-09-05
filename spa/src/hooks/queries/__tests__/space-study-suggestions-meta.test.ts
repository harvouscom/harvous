import { describe, expect, it } from 'vitest';
import { spaceStudySuggestionsToolMeta } from '../useSpaceStudySuggestions';

describe('spaceStudySuggestionsToolMeta', () => {
  it('tells a reviewer how many wait and how many are new', () => {
    expect(spaceStudySuggestionsToolMeta({ canReview: true, queue: [], mine: undefined })).toBe(
      'Nothing waiting',
    );
    expect(
      spaceStudySuggestionsToolMeta({
        canReview: true,
        queue: [{ leaderReadAt: null }, { leaderReadAt: '2026-09-01' }, { leaderReadAt: null }],
        mine: undefined,
      }),
    ).toBe('3 waiting · 2 new');
    expect(
      spaceStudySuggestionsToolMeta({ canReview: true, queue: [{ leaderReadAt: '2026-09-01' }], mine: [] }),
    ).toBe('1 waiting');
  });

  it('tells a member about their own, or invites them', () => {
    expect(spaceStudySuggestionsToolMeta({ canReview: false, queue: undefined, mine: [] })).toBe(
      'Suggest what we study next',
    );
    expect(
      spaceStudySuggestionsToolMeta({
        canReview: false,
        queue: undefined,
        mine: [{ status: 'open' }, { status: 'declined' }],
      }),
    ).toBe('1 of yours waiting');
  });

  it('never shows a member the queue even when it was handed one', () => {
    expect(
      spaceStudySuggestionsToolMeta({ canReview: false, queue: [{ leaderReadAt: null }], mine: [] }),
    ).toBe('Suggest what we study next');
  });
});
