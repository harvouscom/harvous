import { describe, it, expect } from 'vitest';
import { highlightScriptureReferences } from '../scripture-highlighter';

const ref = (reference: string, noteId = 'note_real_123') => [{ reference, noteId }];

describe('highlightScriptureReferences preserves line breaks around references', () => {
  it('keeps the blank paragraph after a pill-only line', () => {
    const input = '<p>intro</p><p>John 3:16</p><p><br></p><p>outro</p>';
    const out = highlightScriptureReferences(input, ref('John 3:16'));
    expect(out).toContain('data-scripture-reference="John 3:16"');
    // The blank paragraph (and the paragraph boundaries) must survive.
    expect(out).toContain('<br>');
    expect((out.match(/<p>/g) || []).length).toBe(4);
    expect((out.match(/<\/p>/g) || []).length).toBe(4);
  });

  it('keeps a soft <br> break immediately after a reference', () => {
    const input = '<p>before<br>John 3:16<br>after</p>';
    const out = highlightScriptureReferences(input, ref('John 3:16'));
    expect(out).toContain('data-scripture-reference="John 3:16"');
    expect((out.match(/<br\s*\/?>/g) || []).length).toBe(2);
  });

  it('keeps a soft <br> break immediately before a reference', () => {
    const input = '<p>before<br>John 3:16</p>';
    const out = highlightScriptureReferences(input, ref('John 3:16'));
    expect((out.match(/<br\s*\/?>/g) || []).length).toBe(1);
    expect(out).toContain('data-scripture-reference');
  });

  it('still tolerates inline formatting tags inside a reference', () => {
    const input = '<p><em>John</em> 3:16</p>';
    const out = highlightScriptureReferences(input, ref('John 3:16'));
    expect(out).toContain('data-scripture-reference="John 3:16"');
  });

  it('re-wraps a pending pill without eating the following blank line', () => {
    // Mirrors the mobile save path: a pending pill gets stripped to text, then re-wrapped.
    const input =
      '<p><span data-scripture-reference="John 3:16" data-note-id="pending" class="scripture-pill scripture-pill-clickable">John 3:16</span></p><p><br></p><p>next</p>';
    const out = highlightScriptureReferences(input, ref('John 3:16'));
    expect(out).toContain('data-note-id="note_real_123"');
    expect(out).toContain('<br>');
    expect((out.match(/<p>/g) || []).length).toBe(3);
  });

  // Idempotency underpins the "visiting a note must not change updatedAt" fix: the load/backfill
  // path re-runs highlighting on open, and process-scripture-references skips the DB write when the
  // result is byte-identical. If re-highlighting an already-resolved pill drifted, every visit would
  // rewrite content. Guard the property here so a future highlighter change can't silently break it.
  it('is idempotent when re-highlighting already-resolved content', () => {
    const refs = [
      { reference: 'John 3:16', noteId: 'n1' },
      { reference: 'Romans 8:28', noteId: 'n2' },
    ];
    const input = '<p>See John 3:16 today</p><p><br></p><p>and Romans 8:28</p>';
    const once = highlightScriptureReferences(input, refs);
    const twice = highlightScriptureReferences(once, refs);
    expect(twice).toBe(once);
  });
});
