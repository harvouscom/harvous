import { describe, expect, it } from 'vitest';
import { translationMixColors } from '../admin-translation-mix-colors';

describe('translationMixColors', () => {
  it('assigns different hues per index for similar counts', () => {
    const a = translationMixColors(0, 10, 189);
    const b = translationMixColors(2, 10, 189);
    const c = translationMixColors(5, 8, 189);
    expect(a.segment).not.toBe(b.segment);
    expect(b.segment).not.toBe(c.segment);
  });

  it('brightens the leader while keeping hue', () => {
    const leader = translationMixColors(0, 189, 189);
    const tail = translationMixColors(0, 4, 189);
    expect(leader.segment).not.toBe(tail.segment);
  });
});
