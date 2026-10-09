import { describe, expect, it } from 'vitest';
import { parsePassageIdentifyParams } from '../scripture-passage-identify';
import { PASSAGE_IDENTIFY_MAX_CHARS } from '@/utils/ocr/passage-match';

describe('parsePassageIdentifyParams', () => {
  it('requires text', () => {
    expect(parsePassageIdentifyParams({})).toMatchObject({ ok: false, code: 'TEXT_REQUIRED' });
    expect(parsePassageIdentifyParams(null)).toMatchObject({ ok: false, code: 'TEXT_REQUIRED' });
    expect(parsePassageIdentifyParams({ text: '   ' })).toMatchObject({ ok: false, code: 'TEXT_REQUIRED' });
  });

  it('refuses a payload longer than a page', () => {
    expect(parsePassageIdentifyParams({ text: 'a'.repeat(PASSAGE_IDENTIFY_MAX_CHARS + 1) })).toMatchObject({
      ok: false,
      code: 'TEXT_TOO_LONG',
    });
  });

  it('keeps a known preferred translation and drops an unknown one', () => {
    expect(parsePassageIdentifyParams({ text: 'For God so loved', preferredTranslation: 'esv' })).toEqual({
      ok: true,
      text: 'For God so loved',
      preferredTranslation: 'ESV',
    });
    expect(parsePassageIdentifyParams({ text: 'For God so loved', preferredTranslation: 'XYZ' })).toMatchObject({
      preferredTranslation: null,
    });
  });
});
