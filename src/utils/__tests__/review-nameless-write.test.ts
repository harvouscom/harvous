import { describe, expect, it } from 'vitest';
import {
  reviewExerciseNeedsNamedSubject,
  reviewPromptIsNamelessWrite,
  reviewPromptSubject,
} from '../review-nameless-write';

describe('a write box that names nothing', () => {
  it('needs a subject once the verse itself is off the page', () => {
    expect(reviewExerciseNeedsNamedSubject('verse.recall', { recallMode: 'reference' })).toBe(true);
    expect(reviewExerciseNeedsNamedSubject('verse.recall', { recallMode: 'leadIn' })).toBe(true);
    expect(reviewExerciseNeedsNamedSubject('verse.recall', { recallMode: 'finish' })).toBe(false);
    expect(reviewExerciseNeedsNamedSubject('verse.initials', { initialsTier: 2 })).toBe(true);
    expect(reviewExerciseNeedsNamedSubject('verse.initials', { initialsTier: 0 })).toBe(false);
    expect(reviewExerciseNeedsNamedSubject('verse.keywords')).toBe(true);
    expect(reviewExerciseNeedsNamedSubject('chapter.finish')).toBe(true);
    expect(reviewExerciseNeedsNamedSubject('verse.rebuild')).toBe(false);
  });

  it('treats a missing reference as an unaskable write, not a bare prompt', () => {
    expect(reviewPromptIsNamelessWrite('verse.recall', { recallMode: 'reference' })).toBe(true);
    expect(
      reviewPromptIsNamelessWrite('verse.recall', {
        recallMode: 'reference',
        reference: 'John 15:5',
      }),
    ).toBe(false);
    expect(reviewPromptIsNamelessWrite('verse.recall', { recallMode: 'finish' })).toBe(false);
  });

  it('prefers the reference over a note title when both exist', () => {
    expect(reviewPromptSubject({ reference: 'John 15:5', noteTitle: 'The vine' })).toBe('John 15:5');
    expect(reviewPromptSubject({})).toBeNull();
  });
});
