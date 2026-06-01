import { describe, it, expect } from 'vitest';
import { highlightScriptureReferences } from '../scripture-highlighter';

describe('highlightScriptureReferences preserves img tags', () => {
  it('leaves img elements unchanged when no scripture refs to apply', () => {
    const html =
      '<p>Before</p><img src="https://example.supabase.co/storage/v1/object/public/note-attachments/u/n/x.jpg" alt=""><p>John 3:16</p>';
    const out = highlightScriptureReferences(html, []);
    expect(out).toBe(html);
    expect(out).toContain('<img src="https://example.supabase.co');
  });
});
