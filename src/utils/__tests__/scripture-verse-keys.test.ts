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

describe('verseKeysFromScriptureReference — chapters and cross-chapter ranges', () => {
  it('keeps a single verse and a whole chapter as before', () => {
    expect(verseKeysFromScriptureReference('John 3:16')).toEqual(['John|3|16']);
    const romans8 = verseKeysFromScriptureReference('Romans 8');
    expect(romans8[0]).toBe('Romans|8|1');
    expect(romans8.at(-1)).toBe('Romans|8|39');
    expect(romans8).toHaveLength(39);
  });

  it('expands a range that crosses into the next chapter (used to yield nothing)', () => {
    const keys = verseKeysFromScriptureReference('Exodus 6:28-7:7');
    expect(keys[0]).toBe('Exodus|6|28');
    expect(keys).toContain('Exodus|6|30');
    expect(keys).toContain('Exodus|7|1');
    expect(keys.at(-1)).toBe('Exodus|7|7');
    expect(keys).toHaveLength(3 + 7);
  });

  it('lets a cross-chapter pill overlap a verse in its second chapter', () => {
    expect(scriptureReferenceContainsReference('Exodus 6:28-7:7', 'Exodus 7:3')).toBe(true);
  });
});
