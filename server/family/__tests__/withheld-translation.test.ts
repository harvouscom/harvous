import { describe, expect, it } from 'vitest';
import { childBibleTranslations, servedChildTranslations } from '../../../shared/child-notebook';
import { isWithheldTranslation, TRANSLATION_ORDER, WITHHELD_TRANSLATIONS } from '@/data/translations';
import { fetchVerseText } from '../../utils/fetch-verse-text';

describe('withheld translations (NLV)', () => {
  it('marks NLV withheld, and nothing a reader is offered', () => {
    expect(WITHHELD_TRANSLATIONS).toEqual(['NLV']);
    expect(isWithheldTranslation('NLV')).toBe(true);
    expect(isWithheldTranslation('nlv')).toBe(true);
    expect(isWithheldTranslation('ERV')).toBe(false);
    expect((childBibleTranslations as readonly string[]).includes('NLV')).toBe(false);
    expect(TRANSLATION_ORDER.includes('NLV')).toBe(false);
  });

  it('drops NLV from a notebook saved with it, falling back to ERV if nothing is left', () => {
    expect(servedChildTranslations(['ERV', 'CEV', 'NLV'])).toEqual(['ERV', 'CEV']);
    expect(servedChildTranslations(['NLV'])).toEqual(['ERV']);
    expect(servedChildTranslations(['BSB'])).toEqual(['BSB']);
  });

  // Refused before any database work: this test has no database to reach.
  it('serves no NLV verse text', async () => {
    await expect(fetchVerseText('Psalm 23:1', 'NLV')).resolves.toBe('');
  });
});
