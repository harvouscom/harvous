import { describe, expect, it } from 'vitest';
import { noteListPreviewTail, resolveNoteListPreview } from '../note-list-preview';

/** What the server sends: `left(content, cap)` plus the stored length. */
function listPayload(stored: string, cap: number) {
  return { content: stored.slice(0, cap), contentLength: stored.length };
}

describe('resolveNoteListPreview', () => {
  it('reports a short note as complete, not truncated', () => {
    const stored = '<p>Short note</p>';
    const { content, contentLength } = listPayload(stored, 2000);
    const preview = resolveNoteListPreview(content, contentLength);
    expect(preview.truncated).toBe(false);
    expect(preview.html).toBe(stored);
  });

  it('trims a mid-tag cut back to the last complete block', () => {
    const stored = '<p>one</p><p>two</p><p>three is long</p>';
    // Cut lands inside the third opening tag.
    const preview = resolveNoteListPreview(stored.slice(0, 23), stored.length);
    expect(preview.truncated).toBe(true);
    expect(preview.html).toBe('<p>one</p><p>two</p>');
    expect(preview.previewLength).toBe(20);
  });

  it('keeps preview as an exact prefix of the stored body', () => {
    const stored = '<p>one</p><p>two</p><p>three</p>';
    const preview = resolveNoteListPreview(stored.slice(0, 25), stored.length);
    expect(stored.slice(0, preview.previewLength)).toBe(preview.html);
  });

  it('falls back to the raw cut when the window holds no complete block', () => {
    const stored = `<p>${'a'.repeat(5000)}</p>`;
    const preview = resolveNoteListPreview(stored.slice(0, 2000), stored.length);
    expect(preview.truncated).toBe(true);
    expect(preview.html).toBe(stored.slice(0, 2000));
    expect(preview.previewLength).toBe(2000);
  });

  it('does not claim truncation when the stored length is unknown', () => {
    // Hand-built seeds have no contentLength; truncation can't be proven, so the
    // save-blocking guarantee is skipped rather than guessed at.
    const preview = resolveNoteListPreview('<p>whatever</p>', undefined);
    expect(preview.truncated).toBe(false);
  });

  it('handles a missing body', () => {
    expect(resolveNoteListPreview(null, null)).toEqual({
      html: '',
      previewLength: 0,
      truncated: false,
    });
  });

  it('recognizes non-paragraph blocks as boundaries', () => {
    const stored = '<h2>Title</h2><ul><li>a</li></ul><p>tail text here</p>';
    const preview = resolveNoteListPreview(stored.slice(0, 40), stored.length);
    expect(preview.html).toBe('<h2>Title</h2><ul><li>a</li></ul>');
  });
});

describe('noteListPreviewTail', () => {
  it('returns exactly the text the preview was missing', () => {
    const stored = '<p>one</p><p>two</p><p>three</p>';
    const { html, previewLength } = resolveNoteListPreview(stored.slice(0, 25), stored.length);
    expect(noteListPreviewTail(stored, html, previewLength)).toBe('<p>three</p>');
  });

  it('round-trips: preview + tail reconstructs the stored body', () => {
    const stored = '<p>alpha</p><h2>beta</h2><p>gamma delta</p>';
    const { html, previewLength } = resolveNoteListPreview(stored.slice(0, 28), stored.length);
    expect(html + noteListPreviewTail(stored, html, previewLength)).toBe(stored);
  });

  it('bails when the full body no longer continues the preview', () => {
    // Server-side rewriting between the two fetches — appending would duplicate text.
    const stored = '<p>rewritten</p><p>three</p>';
    expect(noteListPreviewTail(stored, '<p>one</p>', 10)).toBe('');
  });

  it('bails on a nonsense offset rather than slicing garbage', () => {
    const stored = '<p>one</p>';
    expect(noteListPreviewTail(stored, '<p>one</p>', 0)).toBe('');
    expect(noteListPreviewTail(stored, '<p>one</p>', 9999)).toBe('');
  });

  it('returns empty when there is nothing left to append', () => {
    const stored = '<p>one</p>';
    expect(noteListPreviewTail(stored, stored, stored.length)).toBe('');
  });
});
