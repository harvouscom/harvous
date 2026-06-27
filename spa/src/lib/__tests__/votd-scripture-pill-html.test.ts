import { describe, it, expect } from 'vitest';
import { buildVotdScripturePillHtml } from '../votd-scripture-pill-html';

describe('buildVotdScripturePillHtml', () => {
  it('embeds the requested translation on the pending pill', () => {
    const html = buildVotdScripturePillHtml('John 3:16', 'ESV');
    expect(html).toContain('data-scripture-reference="John 3:16"');
    expect(html).toContain('data-scripture-translation="ESV"');
    expect(html).toContain('data-scripture-translation-label="ESV"');
  });

  it('falls back to NET when translation is empty', () => {
    const html = buildVotdScripturePillHtml('Romans 8:28', '  ');
    expect(html).toContain('data-scripture-translation="NET"');
  });
});
