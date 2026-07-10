import { describe, expect, it } from 'vitest';

import {
  pickStudyThreadRepresentativeNoteId,
  resolveStudyThreadDisplayTitle,
  suggestStudyThreadTitleFromNodes,
} from '@/utils/suggest-study-thread-title';

describe('pickStudyThreadRepresentativeNoteId', () => {
  it('prefers higher degree', () => {
    const rep = pickStudyThreadRepresentativeNoteId(
      ['note_a', 'note_b', 'note_c'],
      { note_a: 1, note_b: 2, note_c: 1 },
    );
    expect(rep).toBe('note_b');
  });

  it('breaks degree ties by lexicographic note id (not focus note)', () => {
    const rep = pickStudyThreadRepresentativeNoteId(
      ['note_zzz', 'note_aaa'],
      new Map([
        ['note_zzz', 1],
        ['note_aaa', 1],
      ]),
    );
    expect(rep).toBe('note_aaa');
  });
});

describe('suggestStudyThreadTitleFromNodes', () => {
  it('uses the user-facing Thread fallback', () => {
    expect(suggestStudyThreadTitleFromNodes([])).toBe('Thread');
  });

  it('prefers keyword theme from combined cluster text over rep note title alone', () => {
    const nodes = [
      { id: 'note_a', title: 'Hello world', content: '<p>misc</p>' },
      {
        id: 'note_b',
        title: 'Prayer journal',
        content: `<p>${'We gather for prayer and petition. '.repeat(12)}</p>`,
      },
    ];
    const suggested = suggestStudyThreadTitleFromNodes(nodes, 'note_a');
    expect(suggested).toBe('Prayer');
  });

  it('falls back to rep note title when no keyword match', () => {
    const nodes = [
      { id: 'note_rep', title: 'My custom cluster label', content: '<p>short</p>' },
      { id: 'note_other', title: 'Other', content: '<p>also short</p>' },
    ];
    expect(suggestStudyThreadTitleFromNodes(nodes, 'note_rep')).toBe('My custom cluster label');
  });

  it('falls back to most recently updated note when rep has no title', () => {
    const nodes = [
      { id: 'note_rep', title: '', content: '' },
      {
        id: 'note_new',
        title: 'Recent study',
        content: '',
        updatedAt: '2026-06-03T12:00:00.000Z',
      },
      {
        id: 'note_old',
        title: 'Older study',
        content: '',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    expect(suggestStudyThreadTitleFromNodes(nodes, 'note_rep')).toBe('Recent study');
  });
});

describe('resolveStudyThreadDisplayTitle', () => {
  it('uses the user-facing Thread fallback for an empty suggestion', () => {
    expect(
      resolveStudyThreadDisplayTitle({
        studyThreadTitle: null,
        studyThreadUserOverride: false,
        suggestedTitle: '',
      }),
    ).toBe('Thread');
  });

  it('uses manual title when user override is on', () => {
    expect(
      resolveStudyThreadDisplayTitle({
        studyThreadTitle: 'Manual name',
        studyThreadUserOverride: true,
        suggestedTitle: 'Prayer',
      }),
    ).toBe('Manual name');
  });

  it('uses suggested title in automatic mode', () => {
    expect(
      resolveStudyThreadDisplayTitle({
        studyThreadTitle: 'Stale override',
        studyThreadUserOverride: false,
        suggestedTitle: 'Faith',
      }),
    ).toBe('Faith');
  });
});
