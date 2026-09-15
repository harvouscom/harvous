import { describe, expect, it } from 'vitest';
import { repairGluedVerseText } from '@/utils/repair-glued-verse-text';

describe('repairGluedVerseText', () => {
  it('inserts a space after sentence punctuation glued to the next word', () => {
    expect(repairGluedVerseText('It was evening, it was morning—Day One.')).toBe(
      'It was evening, it was morning—Day One.',
    );
    expect(repairGluedVerseText('God named the light Day,he named the dark Night.It was evening')).toBe(
      'God named the light Day, he named the dark Night. It was evening',
    );
  });

  it('splits a lowercase-to-uppercase join from a stripped poetry line-break', () => {
    expect(repairGluedVerseText('fulfilled:They took the thirty pieces')).toBe(
      'fulfilled: They took the thirty pieces',
    );
  });

  it('repairs known all-lowercase poetry fusions', () => {
    expect(repairGluedVerseText('raised your voiceand lifted your eyes')).toBe(
      'raised your voice and lifted your eyes',
    );
    expect(repairGluedVerseText('because he has heardmy voice')).toBe(
      'because he has heard my voice',
    );
    expect(repairGluedVerseText('the water under skyfrom the water above')).toBe(
      'the water under sky from the water above',
    );
  });

  it('leaves already-spaced scripture alone', () => {
    const verse = 'I love the Lord, because he has heard my voice and my pleas for mercy.';
    expect(repairGluedVerseText(verse)).toBe(verse);
  });
});
