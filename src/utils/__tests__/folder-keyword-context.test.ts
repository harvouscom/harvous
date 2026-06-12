import { describe, expect, it } from 'vitest';
import { isRitualDescriptiveFolderMention } from '../folder-keyword-context';
import { countLifeKeywordNeedleInLowerText } from '../life-keyword-context';
import { BIBLE_STUDY_KEYWORDS } from '../bible-study-keywords';

function keywordNamed(name: string) {
  const kw = BIBLE_STUDY_KEYWORDS.find((k) => k.name === name);
  if (!kw) throw new Error(`missing keyword ${name}`);
  return kw;
}

describe('isRitualDescriptiveFolderMention', () => {
  it('flags Prayer in ritual-descriptive childhood church prose', () => {
    const prayer = keywordNamed('Prayer');
    const body =
      'Prayer was this formal sounding way of talking to God and for His honor we would sit and stand.';
    expect(isRitualDescriptiveFolderMention(prayer, '', body)).toBe(true);
  });

  it('does not flag Salvation in salvation-call opening narrative', () => {
    const salvation = keywordNamed('Salvation');
    const body = 'I raised my hand during a salvation call at church last Sunday.';
    expect(isRitualDescriptiveFolderMention(salvation, '', body)).toBe(false);
  });
});

describe('family church-attendance context gate', () => {
  it('skips Family matches in my family went to church prose', () => {
    const text =
      'my family went to a local lutheran church in my hometown. later my family and i went to another church.';
    const count = countLifeKeywordNeedleInLowerText(text, 'family', 'Family');
    expect(count).toBe(0);
  });

  it('still counts Family in genuinely family-themed prose', () => {
    const text = 'Our family dinner conversations about parenting and marriage have shaped my faith.';
    const count = countLifeKeywordNeedleInLowerText(text, 'family', 'Family');
    expect(count).toBeGreaterThan(0);
  });
});
