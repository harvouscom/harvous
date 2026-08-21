import { describe, expect, it } from 'vitest';
import { describeSharedPassages, pickBestUnlinkedPair } from '../connect-suggestions';
import type { RelatedNote } from '../scripture-knowledge';

describe('pickBestUnlinkedPair', () => {
  const titleById = new Map([
    ['note_a', 'Romans study'],
    ['note_b', 'Hope in suffering'],
    ['note_c', 'Psalm 73 reflection'],
  ]);

  const related: RelatedNote[] = [
    { noteId: 'note_b', score: 6, sharedPassages: ['Romans|8|28'], sharedCrossRefs: [], sharedThemes: [], sameSection: false },
    { noteId: 'note_c', score: 3, sharedPassages: [], sharedCrossRefs: ['Psalm|73|1'], sharedThemes: [], sameSection: false },
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

  it('names what the pair share, so the client can propose a thread name', () => {
    const result = pickBestUnlinkedPair('note_a', 'Romans study', related, new Set(), titleById);
    expect(result?.sharedSubject).toBe('Romans 8');
  });

  it('describes the signal the pair was actually ranked on', () => {
    // note_c shares no passage, only a cross-reference — the subject must follow that,
    // not silently report a passage overlap that does not exist.
    const result = pickBestUnlinkedPair('note_a', 'Romans study', related, new Set(['note_b']), titleById);
    expect(result?.reason).toBe('Cross-reference');
    expect(result?.sharedSubject).toBe('Psalm 73');
  });

  it('carries a theme as an id to resolve, never as a subject to display', () => {
    // Themes are stored as topic ids. Passing one straight through would have named a
    // thread "topic_assurance" — which is why the id travels in its own field and only
    // becomes a subject once `getConnectSuggestions` has looked up its label.
    const themeOnly: RelatedNote[] = [
      { noteId: 'note_b', score: 2, sharedPassages: [], sharedCrossRefs: [], sharedThemes: ['topic_assurance'], sameSection: false },
    ];
    const result = pickBestUnlinkedPair('note_a', 'Romans study', themeOnly, new Set(), titleById);
    expect(result?.sharedSubject).toBeUndefined();
    expect(result?.sharedThemeId).toBe('topic_assurance');
  });

  it('does not carry a theme id when a passage already named the overlap', () => {
    const both: RelatedNote[] = [
      { noteId: 'note_b', score: 7, sharedPassages: ['Romans|8|28'], sharedCrossRefs: [], sharedThemes: ['topic_assurance'], sameSection: false },
    ];
    const result = pickBestUnlinkedPair('note_a', 'Romans study', both, new Set(), titleById);
    expect(result?.sharedSubject).toBe('Romans 8');
    expect(result?.sharedThemeId).toBeUndefined();
  });

  it('omits the subject entirely rather than inventing one', () => {
    const nothingNamed: RelatedNote[] = [
      { noteId: 'note_b', score: 1, sharedPassages: [], sharedCrossRefs: [], sharedThemes: [], sameSection: true },
    ];
    const result = pickBestUnlinkedPair('note_a', 'Romans study', nothingNamed, new Set(), titleById);
    expect(result?.sharedSubject).toBeUndefined();
    expect(result?.sharedThemeId).toBeUndefined();
  });
});

describe('describeSharedPassages', () => {
  it('names the chapter when the overlap sits inside one', () => {
    // Two notes meeting over several verses of Romans 8 are studying Romans 8 — not
    // whichever verse happens to sort first.
    expect(describeSharedPassages(['Romans|8|28', 'Romans|8|29', 'Romans|8|1'])).toBe('Romans 8');
  });

  it('widens to the book when the overlap crosses chapters', () => {
    expect(describeSharedPassages(['Romans|5|1', 'Romans|8|28'])).toBe('Romans');
  });

  it('gives up when the overlap crosses books, rather than naming one of them', () => {
    expect(describeSharedPassages(['Romans|8|28', 'Psalm|73|1'])).toBeNull();
  });

  it('handles an empty or malformed list', () => {
    expect(describeSharedPassages([])).toBeNull();
    expect(describeSharedPassages(['nonsense'])).toBeNull();
  });

  it('keeps multi-word book names intact', () => {
    expect(describeSharedPassages(['Song of Solomon|2|1'])).toBe('Song of Solomon 2');
  });
});
