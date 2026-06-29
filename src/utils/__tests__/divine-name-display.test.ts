import { describe, expect, it } from 'vitest';
import { formatDivineNamesInLabel, formatPulseThemeLabels } from '@/utils/divine-name-display';

describe('formatDivineNamesInLabel', () => {
  it('capitalizes god after common prepositions', () => {
    expect(formatDivineNamesInLabel('faith in god')).toBe('faith in God');
    expect(formatDivineNamesInLabel('kingdom of god')).toBe('kingdom of God');
    expect(formatDivineNamesInLabel('fear of god')).toBe('fear of God');
  });

  it('formats OpenBible-style gods possessive topics', () => {
    expect(formatDivineNamesInLabel('gods love')).toBe("God's love");
    expect(formatDivineNamesInLabel('gods kingdom')).toBe("God's kingdom");
  });

  it('capitalizes standalone god', () => {
    expect(formatDivineNamesInLabel('god')).toBe('God');
    expect(formatDivineNamesInLabel('names of god')).toBe('names of God');
  });

  it('leaves already-capitalized labels unchanged', () => {
    expect(formatDivineNamesInLabel('Kingdom of God')).toBe('Kingdom of God');
    expect(formatDivineNamesInLabel("God's love")).toBe("God's love");
  });

  it('does not alter unrelated words', () => {
    expect(formatDivineNamesInLabel('false gods')).toBe('false gods');
    expect(formatDivineNamesInLabel('godliness')).toBe('godliness');
  });
});

describe('formatPulseThemeLabels', () => {
  it('maps ranked theme rows for display', () => {
    expect(
      formatPulseThemeLabels([
        { name: 'gods love', count: 76 },
        { name: 'faith in god', count: 74 },
      ]),
    ).toEqual([
      { name: "God's love", count: 76 },
      { name: 'faith in God', count: 74 },
    ]);
  });
});
