import { describe, expect, it } from 'vitest';
import { buildSpaceScriptureIndex, type ScriptureIndexNoteRow } from '../build-space-scripture-index';

const note = (overrides: Partial<ScriptureIndexNoteRow> & { id: string }): ScriptureIndexNoteRow => ({
  title: null,
  content: null,
  updatedAt: '2026-06-10T12:00:00Z',
  createdAt: '2026-06-10T12:00:00Z',
  ...overrides,
});

const john316PillHtml =
  '<p><span data-scripture-reference="John 3:16" data-note-id="note_1" class="scripture-pill">John 3:16</span></p>';

describe('buildSpaceScriptureIndex', () => {
  it('counts a pill once when plain text and attribute both resolve to the same passage', () => {
    const { books } = buildSpaceScriptureIndex([
      note({ id: 'n1', content: john316PillHtml }),
    ]);
    expect(books).toHaveLength(1);
    expect(books[0]?.title).toBe('John');
    expect(books[0]?.referenceCount).toBe(1);
    expect(books[0]?.noteCount).toBe(1);
    expect(books[0]?.passages[0]?.referenceCount).toBe(1);
    expect(books[0]?.passages[0]?.noteCount).toBe(1);
  });

  it('aggregates the same passage across two notes', () => {
    const { books } = buildSpaceScriptureIndex([
      note({ id: 'n1', content: john316PillHtml }),
      note({ id: 'n2', content: '<p>John 3:16</p>' }),
    ]);
    expect(books[0]?.referenceCount).toBe(2);
    expect(books[0]?.noteCount).toBe(2);
    expect(books[0]?.passages[0]?.referenceCount).toBe(2);
    expect(books[0]?.passages[0]?.noteCount).toBe(2);
  });

  it('counts two passages in the same book from one note separately', () => {
    const { books } = buildSpaceScriptureIndex([
      note({
        id: 'n1',
        content: '<p>Romans 8:28 and Romans 12:1</p>',
      }),
    ]);
    expect(books).toHaveLength(1);
    expect(books[0]?.title).toBe('Romans');
    expect(books[0]?.referenceCount).toBe(2);
    expect(books[0]?.noteCount).toBe(1);
    expect(books[0]?.passages).toHaveLength(2);
  });

  it('dedupes repeated plain-text mentions of the same passage in one note', () => {
    const { books } = buildSpaceScriptureIndex([
      note({
        id: 'n1',
        content: '<p>John 3:16 — John 3:16 again</p>',
      }),
    ]);
    expect(books[0]?.referenceCount).toBe(1);
    expect(books[0]?.noteCount).toBe(1);
  });
});
