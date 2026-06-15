import { describe, expect, it } from 'vitest';

import { generateAutoTags } from '../auto-tag-generator';
import {
  autoTagExcludeNames,
  parseDismissedAutoTags,
  serializeDismissedAutoTags,
} from '../tag-helpers';

describe('dismissed auto-tag helpers', () => {
  it('parseDismissedAutoTags normalizes and dedupes', () => {
    expect(parseDismissedAutoTags(JSON.stringify(['Faith', 'faith', ' Prayer ']))).toEqual([
      'faith',
      'prayer',
    ]);
    expect(parseDismissedAutoTags(null)).toEqual([]);
  });

  it('serializeDismissedAutoTags returns null for empty list', () => {
    expect(serializeDismissedAutoTags([])).toBeNull();
    expect(serializeDismissedAutoTags(['Grace'])).toBe(JSON.stringify(['grace']));
  });

  it('autoTagExcludeNames merges folder labels and dismissed names', () => {
    const out = autoTagExcludeNames(['Salvation'], ['faith']);
    expect(out.map((s) => s.toLowerCase())).toEqual(expect.arrayContaining(['salvation', 'faith']));
  });
});

describe('generateAutoTags excludeTagNames', () => {
  it('excludes dismissed tag names from suggestions', async () => {
    const title = 'Salvation and faith in Christ';
    const content =
      '<p>We discussed salvation, faith, prayer, and communion during Sunday service.</p>'.repeat(
        3,
      );
    const baseline = await generateAutoTags(title, content, 'user_test', 0.7);
    const baselineNames = baseline.suggestions.map((s) => s.keyword.toLowerCase());
    expect(baselineNames.length).toBeGreaterThan(0);

    const filtered = await generateAutoTags(title, content, 'user_test', 0.7, {
      excludeTagNames: ['salvation'],
    });
    const filteredNames = filtered.suggestions.map((s) => s.keyword.toLowerCase());
    expect(filteredNames).not.toContain('salvation');
  });
});
