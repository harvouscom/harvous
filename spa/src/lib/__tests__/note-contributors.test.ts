import { describe, expect, it } from 'vitest';
import { formatNoteContributors } from '../shared-space-capabilities';

const ann = { userId: 'u_ann', displayName: 'Ann', color: 'blue' };
const derek = { userId: 'u_derek', displayName: 'Derek', color: 'green' };
const ruth = { userId: 'u_ruth', displayName: 'Ruth', color: 'purple' };
const sam = { userId: 'u_sam', displayName: 'Sam', color: 'amber' };

describe('formatNoteContributors', () => {
  it('says nothing when only the author has written', () => {
    // An opted-in note nobody else has touched shouldn't grow a byline.
    expect(formatNoteContributors([], 'u_ann')).toBeNull();
    expect(formatNoteContributors([ann], 'u_ann')).toBeNull();
  });

  it('credits the author first regardless of list order', () => {
    // Notes.userId never changes, so the author never stops leading the byline.
    expect(formatNoteContributors([derek, ann], 'u_ann')).toBe('Started by Ann · edited by Derek');
  });

  it('names two editors and counts beyond that', () => {
    expect(formatNoteContributors([ann, derek, ruth], 'u_ann')).toBe(
      'Started by Ann · edited by Derek and Ruth',
    );
    expect(formatNoteContributors([ann, derek, ruth, sam], 'u_ann')).toBe(
      'Started by Ann · edited by Derek and 2 others',
    );
  });

  it('says "you" for the reader', () => {
    expect(formatNoteContributors([ann, derek], 'u_ann', 'u_derek')).toBe(
      'Started by Ann · edited by you',
    );
    expect(formatNoteContributors([ann, derek], 'u_ann', 'u_ann')).toBe(
      'Started by you · edited by Derek',
    );
  });
});
