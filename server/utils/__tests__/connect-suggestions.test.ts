import { describe, expect, it } from 'vitest';
import { pickBestUnlinkedPair } from '../connect-suggestions';
import type { RelatedNote } from '../scripture-knowledge';

describe('pickBestUnlinkedPair', () => {
  const titleById = new Map([
    ['note_a', 'Romans study'],
    ['note_b', 'Hope in suffering'],
    ['note_c', 'Psalm 73 reflection'],
  ]);

  const related: RelatedNote[] = [
    { noteId: 'note_b', score: 6, sharedPassages: ['Romans|8|28'], sharedCrossRefs: [], sharedThemes: [] },
    { noteId: 'note_c', score: 3, sharedPassages: [], sharedCrossRefs: ['Psalm|73|1'], sharedThemes: [] },
  ];

  it('picks the strongest unlinked related note', () => {
    const result = pickBestUnlinkedPair('note_a', 'Romans study', related, new Set(), titleById);
    expect(result).toMatchObject({
      noteAId: 'note_a',
      noteBId: 'note_b',
      reason: 'Shared passage',
      score: 6,
    });
  });

  it('skips already-linked notes', () => {
    const result = pickBestUnlinkedPair('note_a', 'Romans study', related, new Set(['note_b']), titleById);
    expect(result?.noteBId).toBe('note_c');
    expect(result?.reason).toBe('Cross-reference');
  });

  it('returns null when all related notes are already linked', () => {
    const result = pickBestUnlinkedPair('note_a', 'Romans study', related, new Set(['note_b', 'note_c']), titleById);
    expect(result).toBeNull();
  });
});
