import { describe, expect, it } from 'vitest';
import { suggestAutoTagsFromNote } from '@/utils/bible-study-tag-web';

describe('suggestAutoTagsFromNote', () => {
  it('returns keyword tags from title and body', () => {
    const tags = suggestAutoTagsFromNote('Grace and faith', '<p>Paul writes about grace and faith in Romans.</p>');
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).toContain('grace');
    expect(names).toContain('faith');
    expect(names).toContain('romans');
  });

  it('detects person tags', () => {
    const tags = suggestAutoTagsFromNote('', '<p>Pastor Tim shared about prayer.</p>');
    expect(tags.some((t) => t.name === 'Pastor Tim')).toBe(true);
  });

  it('skips the standalone keyword god', () => {
    const tags = suggestAutoTagsFromNote('God is good', '<p>God is good.</p>');
    expect(tags.some((t) => t.name.toLowerCase() === 'god')).toBe(false);
  });
});
