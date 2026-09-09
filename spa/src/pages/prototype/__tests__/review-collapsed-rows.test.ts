import { describe, expect, it } from 'vitest';
import { collapsedReviewRows } from '../review-collapsed-rows';

function row(id: string, kind: string, promptKey: string) {
  return { id, kind, promptKey, task: promptKey };
}

describe('collapsedReviewRows', () => {
  it('prefers one note and one scripture', () => {
    const items = [
      row('n1', 'note', 'note.recognize'),
      row('n2', 'note', 'note.passage'),
      row('v1', 'verse', 'verse.recognize'),
    ];
    expect(collapsedReviewRows(items).map((item) => item.id)).toEqual(['n1', 'v1']);
  });

  it('shows two different exercises when the pile is all scripture', () => {
    const items = [
      row('v1', 'verse', 'verse.recognize'),
      row('v2', 'verse', 'verse.recognize'),
      row('v3', 'verse', 'verse.rebuild'),
    ];
    expect(collapsedReviewRows(items).map((item) => item.id)).toEqual(['v1', 'v3']);
  });

  it('never returns more than two closed', () => {
    const items = Array.from({ length: 8 }, (_, i) => row(`v${i}`, 'verse', `verse.${i}`));
    expect(collapsedReviewRows(items)).toHaveLength(2);
  });
});
