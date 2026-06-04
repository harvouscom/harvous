import { describe, expect, it } from 'vitest';

import { resolveStudyThreadClusterNaming } from '../../../server/utils/study-thread-cluster-naming';
import type { StudyThreadNoteRow } from '../../../server/utils/study-thread-note-rows';

function row(
  partial: Partial<StudyThreadNoteRow> & Pick<StudyThreadNoteRow, 'id'>,
): StudyThreadNoteRow {
  return {
    title: null,
    content: null,
    simpleNoteId: null,
    noteType: 'default',
    studyThreadTitle: null,
    studyThreadUserOverride: false,
    studyThreadPinned: false,
    updatedAt: null,
    ...partial,
  };
}

describe('resolveStudyThreadClusterNaming', () => {
  it('uses manual title from a non-representative member so list and panel agree', () => {
    const memberRows = [
      row({ id: 'note_aaa', studyThreadUserOverride: false }),
      row({
        id: 'note_zzz',
        studyThreadUserOverride: true,
        studyThreadTitle: 'Exodus',
        title: 'Lets write',
        content: '<p>Write about Exodus 5:1-5 NLT</p>',
      }),
    ];
    const suggestNodes = memberRows.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      noteType: n.noteType,
    }));

    const naming = resolveStudyThreadClusterNaming(memberRows, suggestNodes, 'note_aaa');
    expect(naming.threadTitle).toBe('Exodus');
    expect(naming.studyThreadUserOverride).toBe(true);
    expect(naming.repNoteId).toBe('note_aaa');
  });

  it('returns the same automatic title for every rep in a two-note cluster', () => {
    const memberRows = [
      row({
        id: 'note_a',
        title: 'Testing out the app 2',
        content: '<p>Let me write about Genesis 2:20 NLT</p>',
      }),
      row({
        id: 'note_b',
        title: 'Lets write',
        content: '<p>Write about Exodus 5:1-5 NLT And Matthew 2:2</p>',
      }),
    ];
    const suggestNodes = memberRows.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      noteType: n.noteType,
    }));

    const fromA = resolveStudyThreadClusterNaming(memberRows, suggestNodes, 'note_a');
    const fromB = resolveStudyThreadClusterNaming(memberRows, suggestNodes, 'note_b');
    expect(fromA.threadTitle).toBe(fromB.threadTitle);
    expect(fromA.suggestedTitle).toBe(fromB.suggestedTitle);
    expect(fromA.studyThreadUserOverride).toBe(false);
  });

  it('honors legacy manual title saved without userOverride flag', () => {
    const memberRows = [
      row({
        id: 'note_a',
        studyThreadTitle: 'Exodus',
        studyThreadUserOverride: false,
        title: 'Testing',
        content: '<p>Genesis 2:20 NLT</p>',
      }),
      row({
        id: 'note_b',
        title: 'Lets write',
        content: '<p>Exodus 5:1-5 NLT</p>',
      }),
    ];
    const suggestNodes = memberRows.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      noteType: n.noteType,
    }));

    const naming = resolveStudyThreadClusterNaming(memberRows, suggestNodes, 'note_a');
    expect(naming.threadTitle).toBe('Exodus');
    expect(naming.studyThreadUserOverride).toBe(true);
  });
});
