import { describe, expect, it, vi } from 'vitest';
import { saveReferenceStudyThread } from '../save-reference-study-thread';

/**
 * The one path both the editor and the Bible reader save through. What is pinned here is
 * the shape on the wire and the two ways a caller can hand it nothing useful.
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
   * A reference has nowhere to live without a note, which is the whole reason the reader has
   * to get the user one first. Failing here rather than posting to `/api/notes//…` keeps that
   * requirement from turning into a confusing 404.
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
