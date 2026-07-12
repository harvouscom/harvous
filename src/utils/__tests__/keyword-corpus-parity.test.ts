import { describe, expect, it } from 'vitest';
import { BIBLE_STUDY_KEYWORDS } from '../bible-study-keywords';

/** Native corpus rows that web must also ship for folder/tag parity. */
const NATIVE_PARITY_KEYWORDS = ['Passover', 'Priesthood', 'Sacrificial System', 'Exodus Theme'] as const;

describe('web/native keyword corpus parity', () => {
  it('includes curated study topics present in native BibleStudyTagSuggester', () => {
    const names = new Set(BIBLE_STUDY_KEYWORDS.map((k) => k.name));
    for (const name of NATIVE_PARITY_KEYWORDS) {
      expect(names.has(name)).toBe(true);
    }
  });

  it('Passover keyword matches passover lamb prose', () => {
    const passover = BIBLE_STUDY_KEYWORDS.find((k) => k.name === 'Passover');
    expect(passover?.synonyms.some((s) => s.includes('passover'))).toBe(true);
  });
});
