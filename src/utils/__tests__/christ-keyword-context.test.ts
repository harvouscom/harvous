import { describe, expect, it } from 'vitest';
import {
  shouldSkipJesusCharacterNeedleMatch,
  shouldSuppressJesusAutoTag,
} from '@/utils/christ-keyword-context';
import { isUniversalBibleEntity, filterUniversalBibleEntities, filterPulseDiscoveryThemes } from '@/utils/universal-bible-entities';

describe('isUniversalBibleEntity', () => {
  it('recognizes universal biblical names case-insensitively', () => {
    expect(isUniversalBibleEntity('Jesus')).toBe(true);
    expect(isUniversalBibleEntity('the lord')).toBe(true);
    expect(isUniversalBibleEntity('Moses')).toBe(false);
  });
});

describe('filterPulseDiscoveryThemes', () => {
  it('drops universal names, book titles, and keeps substantive passage themes', () => {
    const items = [
      { name: 'Jesus', count: 91 },
      { name: 'John', count: 50 },
      { name: 'gods love', count: 76 },
      { name: 'Christ', count: 40 },
      { name: 'Psalms', count: 22 },
      { name: 'faith in god', count: 74 },
    ];
    expect(filterPulseDiscoveryThemes(items, 3)).toEqual([
      { name: 'gods love', count: 76 },
      { name: 'faith in god', count: 74 },
    ]);
  });
});

describe('filterUniversalBibleEntities', () => {
  it('drops universal names and preserves order', () => {
    expect(filterUniversalBibleEntities(['Grace', 'Jesus', 'Peter', 'Christ'])).toEqual([
      'Grace',
      'Peter',
    ]);
  });
});

describe('shouldSkipJesusCharacterNeedleMatch', () => {
  it('skips christ inside in christ', () => {
    const text = 'we walk in christ daily';
    const start = text.indexOf('christ');
    expect(
      shouldSkipJesusCharacterNeedleMatch('Jesus', 'christ', text, start, start + 'christ'.length),
    ).toBe(true);
  });

  it('does not skip literal jesus in narrative', () => {
    const text = 'jesus calms the storm';
    const start = text.indexOf('jesus');
    expect(
      shouldSkipJesusCharacterNeedleMatch('Jesus', 'jesus', text, start, start + 'jesus'.length),
    ).toBe(false);
  });
});

describe('shouldSuppressJesusAutoTag', () => {
  it('suppresses Jesus for devotional lord language without literal Jesus', () => {
    const body = 'o lord, thank you for grace today';
    expect(shouldSuppressJesusAutoTag('Jesus', 0.9, body, '', { synonymOnly: true })).toBe(true);
  });

  it('allows Jesus when the title names him', () => {
    expect(
      shouldSuppressJesusAutoTag('Jesus', 0.9, 'the sermon on the mount', 'jesus teaches', {
        synonymOnly: true,
      }),
    ).toBe(false);
  });
});
