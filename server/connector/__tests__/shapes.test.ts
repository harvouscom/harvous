import { describe, expect, it } from 'vitest';
import {
  ConnectorRefusal,
  decodeCursor,
  encodeCursor,
  lockedNoteMetadata,
  nextCursorFor,
  toNoteDetail,
  toNoteSummary,
} from '../shapes';
import { MAX_OFFSET } from '../config';

const ME = 'user_me';
const THEM = 'user_them';

const PILL =
  '<p>Grace in <span class="scripture-pill" data-scripture-reference="Romans 8:28" data-scripture-translation="NET">Romans 8:28 And we know that all things work together</span> today.</p>';

describe('note summaries', () => {
  it('gives a locked note no snippet', () => {
    const s = toNoteSummary({ id: 'note_1', title: 'Secret', content: 'ciphertext', contentEncrypted: true }, ME);
    expect(s).toMatchObject({ locked: true, snippet: null, title: 'Secret' });
  });

  it('never returns the body of a legacy scripture note (Bible text), only its reference', () => {
    const s = toNoteSummary(
      { id: 'note_2', title: 'John 3:16', content: 'For God so loved', noteType: 'scripture', scriptureReference: 'John 3:16' },
      ME,
    );
    expect(s.snippet).toBeNull();
    expect(s.scriptureReference).toBe('John 3:16');
  });

  it('says whose note it is without saying who', () => {
    const s = toNoteSummary({ id: 'note_3', title: 'x', content: '<p>x</p>', authorUserId: THEM }, ME);
    expect(s.byYou).toBe(false);
    expect(JSON.stringify(s)).not.toContain(THEM);
  });
});

describe('note detail', () => {
  const base = {
    id: 'note_1',
    title: 'Romans',
    content: PILL,
    noteType: 'default',
    contentEncrypted: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    authorUserId: ME,
    folder: 'Romans',
    tags: ['grace'],
    scriptureReferences: [{ reference: 'Romans 8:28' }, { reference: 'romans 8:28' }],
  };

  it('turns scripture pills into their reference, not the verse text in the pill', () => {
    const d = toNoteDetail(base, ME);
    if (d.locked) throw new Error('expected unlocked');
    expect(d.bodyMarkdown).toContain('Romans 8:28');
    expect(d.bodyMarkdown).not.toContain('all things work together');
    expect(d.scriptureReferences).toEqual(['Romans 8:28']);
  });

  it('returns your own locked note as metadata only — not an error', () => {
    const d = toNoteDetail({ ...base, contentEncrypted: true }, ME);
    expect(d).toMatchObject({ locked: true, id: 'note_1', title: 'Romans' });
    expect(JSON.stringify(d)).not.toContain('Grace');
  });

  it("refuses someone else's locked note as not found", () => {
    expect(() => toNoteDetail({ ...base, contentEncrypted: true, authorUserId: THEM }, ME)).toThrow(ConnectorRefusal);
  });

  it("keeps another member's folders and tags out of a shared note", () => {
    const d = toNoteDetail({ ...base, authorUserId: THEM }, ME);
    if (d.locked) throw new Error('expected unlocked');
    expect(d.byYou).toBe(false);
    expect(d.folder).toBeUndefined();
    expect(d.tags).toBeUndefined();
  });

  it('gives a legacy scripture note its reference and no body', () => {
    const d = toNoteDetail(
      { ...base, noteType: 'scripture', content: 'For God so loved the world', legacyScripture: { reference: 'John 3:16', translation: 'NET' } },
      ME,
    );
    if (d.locked) throw new Error('expected unlocked');
    expect(d.bodyMarkdown).toBeNull();
    expect(d.scripture).toEqual({ reference: 'John 3:16', translation: 'NET' });
  });

  it('cuts a very long body and says so', () => {
    const d = toNoteDetail({ ...base, content: `<p>${'a'.repeat(70_000)}</p>` }, ME);
    if (d.locked) throw new Error('expected unlocked');
    expect(d.truncated).toBe(true);
    expect(d.bodyMarkdown!.length).toBeLessThanOrEqual(60_000);
  });

  it('locked metadata carries a message telling the person what to do', () => {
    expect(lockedNoteMetadata(base)).toMatchObject({ locked: true, message: expect.stringContaining('unlock') });
  });
});

describe('cursors', () => {
  const scope = { spaceId: 'space_1' };

  it('round-trips an offset for the same query', () => {
    expect(decodeCursor(encodeCursor('list_notes_in_space', scope, 40), 'list_notes_in_space', scope)).toBe(40);
  });

  it('starts at zero without a cursor', () => {
    expect(decodeCursor(undefined, 'list_notes_in_space', scope)).toBe(0);
  });

  it('refuses a cursor replayed against a different query', () => {
    const cursor = encodeCursor('list_notes_in_space', scope, 40);
    expect(() => decodeCursor(cursor, 'list_notes_in_space', { spaceId: 'space_2' })).toThrow(/different query/);
    expect(() => decodeCursor(cursor, 'search_notes', scope)).toThrow(ConnectorRefusal);
  });

  it('refuses garbage and tampered offsets', () => {
    expect(() => decodeCursor('not-a-cursor', 'list_spaces', {})).toThrow(ConnectorRefusal);
    const forged = Buffer.from(JSON.stringify({ v: 1, o: -5, k: 'x' })).toString('base64url');
    expect(() => decodeCursor(forged, 'list_spaces', {})).toThrow(ConnectorRefusal);
  });

  it('stops at the offset cap — paging is for finding, not exporting', () => {
    expect(nextCursorFor('list_spaces', {}, MAX_OFFSET - 10, 25, 26)).toBeNull();
    expect(nextCursorFor('list_spaces', {}, 0, 25, 26)).not.toBeNull();
    expect(nextCursorFor('list_spaces', {}, 0, 25, 25)).toBeNull();
  });
});
