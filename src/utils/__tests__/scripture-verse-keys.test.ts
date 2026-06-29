import { describe, expect, it } from 'vitest';
import {
  scriptureReferenceContainsReference,
  verseKeysFromScriptureReference,
} from '@/utils/scripture-verse-keys';

describe('scriptureReferenceContainsReference', () => {
  it('matches when a range pill contains a single-verse request', () => {
    expect(scriptureReferenceContainsReference('Lamentations 3:22-26', 'Lamentations 3:22')).toBe(true);
  });

  it('does not match unrelated passages', () => {
    expect(scriptureReferenceContainsReference('Lamentations 3:22', 'Psalms 86:15')).toBe(false);
  });
});

describe('verseKeysFromScriptureReference', () => {
  it('expands a verse range', () => {
    expect(verseKeysFromScriptureReference('Romans 8:28-30')).toEqual([
      'Romans|8|28',
      'Romans|8|29',
      'Romans|8|30',
    ]);
  });
});
