import { describe, expect, it } from 'vitest';

import { studyThreadDisplayTitle } from '../../../spa/src/utils/study-thread-display-title';
import type { StudyThreadResponse } from '../../../spa/src/hooks/queries/usePrototypeStudyThread';

function thread(partial: Partial<StudyThreadResponse>): StudyThreadResponse {
  return {
    success: true,
    focusNoteId: 'note_a',
    repNoteId: 'note_a',
    threadTitle: null,
    suggestedTitle: 'Genesis',
    studyThreadUserOverride: false,
    studyThreadPinned: false,
    nodes: [],
    edges: [],
    nodeCount: 0,
    ...partial,
  };
}

describe('studyThreadDisplayTitle', () => {
  it('uses suggested title in automatic mode', () => {
    expect(
      studyThreadDisplayTitle(
        thread({ threadTitle: 'Exodus', suggestedTitle: 'Genesis', studyThreadUserOverride: false }),
      ),
    ).toBe('Genesis');
  });

  it('uses manual title in manual mode', () => {
    expect(
      studyThreadDisplayTitle(
        thread({
          threadTitle: 'Exodus',
          suggestedTitle: 'Genesis',
          studyThreadUserOverride: true,
        }),
      ),
    ).toBe('Exodus');
  });
});
