import { describe, expect, it } from 'vitest';
import { highlightScriptureReferences } from '../scripture-highlighter';

describe('highlightScriptureReferences pill accent', () => {
  it('emits data-pill-accent without inline background-color', () => {
    const html = '<p>See John 3:16 here</p>';
    const out = highlightScriptureReferences(html, [
      { reference: 'John 3:16', noteId: 'note_scripture_1', translation: 'ESV', accent: 'warmAmber' },
    ]);
    expect(out).toContain('data-pill-accent="warmAmber"');
    expect(out).toContain('class="scripture-pill scripture-pill-clickable"');
    expect(out).not.toContain('background-color');
    expect(out).not.toMatch(/style\s*=/);
  });
});
