import { describe, expect, it } from 'vitest';
import { chapterAnchorsFromScriptureIndex } from '../chapter-anchors-from-scripture-index';

/** Romans is bookOrder 44 in the canon map (0-based, Genesis = 0). */
const ROMANS = 44;

const note = (id: string, title = `Note ${id}`) => ({
  id,
  title,
  updatedAt: '2026-08-14T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
});

describe('chapterAnchorsFromScriptureIndex', () => {
  it('turns one indexed passage into one anchor per note', () => {
    const anchors = chapterAnchorsFromScriptureIndex(
      [
        {
          bookOrder: ROMANS,
          passages: [
            { displayRef: 'Romans 8:1-11', chapter: 8, verseStart: 1, verseEnd: 11, notes: [note('a'), note('b')] },
          ],
        },
      ],
      'Romans',
      8,
    );

    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toEqual({
      noteId: 'a',
      reference: 'Romans 8:1-11',
      verse: 1,
      verseEnd: 11,
      chapterEnd: null,
      title: 'Note a',
      updatedAt: '2026-08-14T00:00:00.000Z',
    });
  });

  it('gives a single verse a null verseEnd, matching the live endpoint', () => {
    const anchors = chapterAnchorsFromScriptureIndex(
      [{ bookOrder: ROMANS, passages: [{ displayRef: 'Romans 8:28', chapter: 8, verseStart: 28, verseEnd: 28, notes: [note('a')] }] }],
      'Romans',
      8,
    );

    expect(anchors[0]).toMatchObject({ verse: 28, verseEnd: null });
  });

  /**
   * The index flattens a cross-chapter range and drops the end chapter, so "Romans 8:20-9:10"
   * arrives as verseStart 20, verseEnd 10 — inverted. Read literally that is a bar from 20 up
   * to 10, i.e. nothing. It runs to the end of its own chapter instead: the note stays visible
   * where it starts, and the tail chapter goes un-marked rather than mis-marked.
   */
  it('runs a flattened cross-chapter range to the end of its own chapter', () => {
    const anchors = chapterAnchorsFromScriptureIndex(
      [{ bookOrder: ROMANS, passages: [{ displayRef: 'Romans 8:20-9:10', chapter: 8, verseStart: 20, verseEnd: 10, notes: [note('a')] }] }],
      'Romans',
      8,
    );

    // Romans 8 has 39 verses.
    expect(anchors[0]).toMatchObject({ verse: 20, verseEnd: 39, chapterEnd: null });
  });

  it('ignores other books and other chapters', () => {
    const anchors = chapterAnchorsFromScriptureIndex(
      [
        { bookOrder: ROMANS, passages: [{ displayRef: 'Romans 9:1', chapter: 9, verseStart: 1, verseEnd: 1, notes: [note('x')] }] },
        { bookOrder: 42, passages: [{ displayRef: 'John 8:1', chapter: 8, verseStart: 1, verseEnd: 1, notes: [note('y')] }] },
      ],
      'Romans',
      8,
    );

    expect(anchors).toEqual([]);
  });

  it('is empty for an unknown book, an empty index, or a passage nobody has written about', () => {
    expect(chapterAnchorsFromScriptureIndex([], 'Romans', 8)).toEqual([]);
    expect(chapterAnchorsFromScriptureIndex(null, 'Romans', 8)).toEqual([]);
    expect(chapterAnchorsFromScriptureIndex([{ bookOrder: 0, passages: [] }], 'Hezekiah', 1)).toEqual([]);
    expect(
      chapterAnchorsFromScriptureIndex(
        [{ bookOrder: ROMANS, passages: [{ displayRef: 'Romans 8:1', chapter: 8, verseStart: 1, verseEnd: 1, notes: [] }] }],
        'Romans',
        8,
      ),
    ).toEqual([]);
  });
});
