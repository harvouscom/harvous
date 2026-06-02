import { describe, expect, it } from 'vitest';
import { stripHtmlForListPreview } from '../html-stripper';

describe('stripHtmlForListPreview', () => {
  it('joins block lines with a middle dot separator', () => {
    expect(stripHtmlForListPreview('<p>Proverbs 16:9</p><p>Writing about Exodus 5:1-10</p>', 80)).toBe(
      'Proverbs 16:9 · Writing about Exodus 5:1-10',
    );
  });

  it('skips empty filler paragraphs and uses later lines', () => {
    const preview = stripHtmlForListPreview('<p>&nbsp;</p><p>Writing about Exodus</p>', 80);
    expect(preview).toBe('Writing about Exodus');
    expect(preview).not.toContain('&nbsp');
  });

  it('fills preview from additional lines when the first is short', () => {
    expect(stripHtmlForListPreview('<p>Hi</p><p>Second line here</p><p>Third</p>', 80)).toBe(
      'Hi · Second line here · Third',
    );
  });

  it('truncates with ellipsis when content exceeds max length', () => {
    const long = '<p>' + 'word '.repeat(40) + '</p>';
    const preview = stripHtmlForListPreview(long, 20);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(21);
  });
});
