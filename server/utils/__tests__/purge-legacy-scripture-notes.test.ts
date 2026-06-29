import { describe, expect, it } from 'vitest';
import { rewriteScripturePillNoteIdInHtml } from '../purge-legacy-scripture-notes';

describe('rewriteScripturePillNoteIdInHtml', () => {
  it('rewrites data-note-id on scripture pills to the parent note id', () => {
    const html =
      '<p>See <span data-scripture-reference="John 3:16" data-note-id="note_child" class="scripture-pill">John 3:16</span></p>';
    expect(rewriteScripturePillNoteIdInHtml(html, 'note_child', 'note_parent')).toBe(
      '<p>See <span data-scripture-reference="John 3:16" data-note-id="note_parent" class="scripture-pill">John 3:16</span></p>',
    );
  });

  it('handles reversed attribute order and single-quoted ids', () => {
    const html =
      "<p><span data-note-id='note_child' data-scripture-reference='Psalm 23:1'>Psalm 23:1</span></p>";
    expect(rewriteScripturePillNoteIdInHtml(html, 'note_child', 'note_parent')).toContain(
      "data-note-id='note_parent'",
    );
  });

  it('is a no-op when ids match or inputs are empty', () => {
    const html = '<p><span data-note-id="note_a">John 3:16</span></p>';
    expect(rewriteScripturePillNoteIdInHtml(html, 'note_a', 'note_a')).toBe(html);
    expect(rewriteScripturePillNoteIdInHtml('', 'note_a', 'note_b')).toBe('');
  });
});
