import { describe, expect, it } from 'vitest';
import {
  extractResolvedScripturePillReferencesFromHtml,
  filterReferencesWithoutExistingPills,
} from '../scripture-pill-paste-html';

describe('extractResolvedScripturePillReferencesFromHtml', () => {
  it('collects normalized refs from pills with real note ids', () => {
    const html =
      '<p><span data-scripture-reference="John 3:16" data-note-id="note_42" class="scripture-pill">John 3:16</span></p>';
    const refs = extractResolvedScripturePillReferencesFromHtml(html);
    expect(refs.has('John 3:16')).toBe(true);
  });

  it('ignores pending or empty note ids', () => {
    const html =
      '<p><span data-scripture-reference="Romans 8:28" data-note-id="pending">Romans 8:28</span>' +
      '<span data-note-id="" data-scripture-reference="Psalm 23:1">Psalm 23:1</span></p>';
    expect(extractResolvedScripturePillReferencesFromHtml(html).size).toBe(0);
  });

  it('handles attribute order either way', () => {
    const html =
      '<p><span data-note-id="note_9" data-scripture-reference="Matthew 5:3" class="scripture-pill">Matthew 5:3</span></p>';
    const refs = extractResolvedScripturePillReferencesFromHtml(html);
    expect(refs.has('Matthew 5:3')).toBe(true);
  });
});

describe('filterReferencesWithoutExistingPills', () => {
  it('drops references that already have resolved pills in pasted HTML', () => {
    const pasted =
      '<p><span data-scripture-reference="John 3:16" data-note-id="note_1">John 3:16</span> and John 3:16 again</p>';
    const existing = extractResolvedScripturePillReferencesFromHtml(pasted);
    const detected = [{ reference: 'John 3:16' }, { reference: 'Romans 8:28' }];
    const filtered = filterReferencesWithoutExistingPills(detected, existing);
    expect(filtered).toEqual([{ reference: 'Romans 8:28' }]);
  });
});
