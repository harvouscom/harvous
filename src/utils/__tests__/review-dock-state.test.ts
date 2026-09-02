import { describe, expect, it } from 'vitest';
import { canJudgeRecall, resolveReviewDockItem } from '../review-dock-state';

const item = (id: string) => ({ id });

describe('resolveReviewDockItem', () => {
  it('prefers the item that was asked for', () => {
    expect(resolveReviewDockItem('b', [item('a'), item('b')])).toEqual(item('b'));
  });

  it('finds a requested item that is scheduled rather than due', () => {
    // A "Coming back later" row on the Review page names an item the session does not hold.
    expect(resolveReviewDockItem('z', [item('a')], [item('z')])).toEqual(item('z'));
  });

  it('advances to the head of the queue when the requested item is gone', () => {
    // What happens the render after an answer: the mutation drops it from the session.
    expect(resolveReviewDockItem('answered', [item('next')])).toEqual(item('next'));
  });

  it('takes the head of the queue when nothing was asked for', () => {
    expect(resolveReviewDockItem(null, [item('a'), item('b')])).toEqual(item('a'));
    expect(resolveReviewDockItem(undefined, [item('a')])).toEqual(item('a'));
  });

  it('answers null rather than guessing when there is nothing due', () => {
    expect(resolveReviewDockItem('x', [], [])).toBeNull();
    expect(resolveReviewDockItem(null, [])).toBeNull();
  });
});

describe('canJudgeRecall', () => {
  it('lets someone judge after a written attempt', () => {
    expect(canJudgeRecall({ attempt: 'the spirit of adoption' })).toBe(true);
  });

  it('does not offer a verdict to someone who revealed cold', () => {
    // Writing is the whole signal. There is no button for "I had it in mind" — asking someone
    // to declare a mental state before checking it is the survey the strategy doc rules out.
    expect(canJudgeRecall({ attempt: '' })).toBe(false);
    expect(canJudgeRecall({ attempt: '   ' })).toBe(false);
  });
});
