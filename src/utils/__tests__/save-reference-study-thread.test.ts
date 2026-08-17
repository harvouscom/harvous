import { describe, expect, it, vi } from 'vitest';
import {
  saveReaderReferenceStudyThread,
  saveReferenceStudyThread,
} from '../save-reference-study-thread';

/**
 * The two doors a saved reference goes through — anchored to a note from the editor, or to a
 * passage from the reader. What is pinned here is the shape on the wire for each, and the
 * ways a caller can hand either one nothing useful.
 */

function okFetch(id = 'thread_1') {
  return vi.fn(async () =>
    new Response(JSON.stringify({ studyThread: { id } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

const input = {
  noteId: 'note_1',
  word: 'Rome',
  reference: 'Romans 1:7',
  translation: 'KJV',
  spaceId: 'space_1',
};

describe('saveReferenceStudyThread', () => {
  it('posts the reference to the note it belongs to', async () => {
    const f = okFetch();
    const id = await saveReferenceStudyThread(input, f);

    expect(id).toBe('thread_1');
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/notes/note_1/study-threads');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      entryKind: 'reference',
      sourceSnippet: 'Rome',
      focusTitle: 'Rome',
      scriptureReference: 'Romans 1:7',
      scripturePassageTranslation: 'KJV',
      contextSpaceId: 'space_1',
    });
  });

  /** So "Rom 1:7" saved from a note and "Romans 1:7" saved from the reader are one anchor. */
  it('normalizes the reference it anchors to', async () => {
    const f = okFetch();
    await saveReferenceStudyThread({ ...input, reference: 'Rom 1:7' }, f);
    const body = JSON.parse(
      ((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.scriptureReference).toBe('Romans 1:7');
  });

  /**
   * This is the note-anchored door, so a missing note is a caller error rather than a case to
   * handle — the reader's parentless save has its own function. Failing here rather than
   * posting to `/api/notes//…` keeps that from turning into a confusing 404.
   */
  it('refuses to save without a note or without a word', async () => {
    const f = okFetch();
    expect(await saveReferenceStudyThread({ ...input, noteId: '' }, f)).toBeNull();
    expect(await saveReferenceStudyThread({ ...input, word: '   ' }, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('reports failure rather than throwing, so the caller can keep its pending state', async () => {
    const rejecting = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await saveReferenceStudyThread(input, rejecting)).toBeNull();

    const refused = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    expect(await saveReferenceStudyThread(input, refused)).toBeNull();
  });
});

function okReferenceFetch(id = 'thread_r1') {
  return vi.fn(async () =>
    new Response(JSON.stringify({ reference: { id } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

const readerInput = {
  word: 'Rome',
  reference: 'Romans 1:7',
  translation: 'KJV',
  spaceId: 'space_1',
};

describe('saveReaderReferenceStudyThread', () => {
  it('posts to the passage-addressed endpoint, with no note in the payload', async () => {
    const f = okReferenceFetch();
    const id = await saveReaderReferenceStudyThread(readerInput, f);

    expect(id).toBe('thread_r1');
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/scripture/references');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      word: 'Rome',
      reference: 'Romans 1:7',
      translation: 'KJV',
      spaceId: 'space_1',
    });
    expect(body).not.toHaveProperty('noteId');
  });

  /** Same anchor as the note-saved version, so the two cannot describe one passage two ways. */
  it('normalizes the reference it anchors to', async () => {
    const f = okReferenceFetch();
    await saveReaderReferenceStudyThread({ ...readerInput, reference: 'Rom 1:7' }, f);
    const body = JSON.parse(
      ((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.reference).toBe('Romans 1:7');
  });

  it('refuses to save without a word or without a space', async () => {
    const f = okReferenceFetch();
    expect(await saveReaderReferenceStudyThread({ ...readerInput, word: '  ' }, f)).toBeNull();
    expect(await saveReaderReferenceStudyThread({ ...readerInput, spaceId: '' }, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('reports failure rather than throwing', async () => {
    const rejecting = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await saveReaderReferenceStudyThread(readerInput, rejecting)).toBeNull();

    const refused = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    expect(await saveReaderReferenceStudyThread(readerInput, refused)).toBeNull();
  });
});
