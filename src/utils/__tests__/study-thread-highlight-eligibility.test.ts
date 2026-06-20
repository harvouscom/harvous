import { describe, it, expect } from 'vitest';
import { studyThreadEligibleForHighlightList } from '@/utils/study-thread-highlight-eligibility';

describe('studyThreadEligibleForHighlightList', () => {
  it('includes scripture passage highlights', () => {
    expect(
      studyThreadEligibleForHighlightList({
        entryKindRaw: 'scriptureLink',
        scripturePassageExcerpt: 'In the beginning',
        scripturePassageTranslation: 'NET',
      }),
    ).toBe(true);
  });

  it('includes anchored prose highlights', () => {
    expect(
      studyThreadEligibleForHighlightList({
        entryKindRaw: 'miniNote',
        anchorLocation: 10,
        anchorLength: 5,
      }),
    ).toBe(true);
  });

  it('includes legacy miniNote rows with snippet only', () => {
    expect(
      studyThreadEligibleForHighlightList({
        entryKindRaw: 'miniNote',
        sourceSnippet: 'grace and truth',
      }),
    ).toBe(true);
  });

  it('includes reference passage dictionary words', () => {
    expect(
      studyThreadEligibleForHighlightList({
        entryKindRaw: 'reference',
        scripturePassageExcerpt: 'covenant',
      }),
    ).toBe(true);
  });

  it('includes linkedNote rows with linked note id and snippet', () => {
    expect(
      studyThreadEligibleForHighlightList({
        entryKindRaw: 'linkedNote',
        linkedNoteId: 'note_abc',
        sourceSnippet: 'connected selection',
      }),
    ).toBe(true);
  });

  it('excludes empty workspace-like rows', () => {
    expect(
      studyThreadEligibleForHighlightList({
        entryKindRaw: 'miniNote',
      }),
    ).toBe(false);
    expect(
      studyThreadEligibleForHighlightList({
        entryKindRaw: 'linkedNote',
        linkedNoteId: 'note_abc',
      }),
    ).toBe(false);
  });
});
