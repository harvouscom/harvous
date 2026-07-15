import { describe, expect, it } from 'vitest';
import { suggestAutoTagsFromNote } from '@/utils/bible-study-tag-web';

describe('suggestAutoTagsFromNote', () => {
  it('returns keyword tags from title and body', () => {
    const tags = suggestAutoTagsFromNote('Grace and faith', '<p>Paul writes about grace and faith in Romans.</p>');
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).toContain('grace');
    expect(names).toContain('faith');
    expect(names).toContain('romans');
  });

  it('detects person tags', () => {
    const tags = suggestAutoTagsFromNote('', '<p>Pastor Tim shared about prayer.</p>');
    expect(tags.some((t) => t.name === 'Pastor Tim')).toBe(true);
  });

  it('skips the standalone keyword god', () => {
    const tags = suggestAutoTagsFromNote('God is good', '<p>God is good.</p>');
    expect(tags.some((t) => t.name.toLowerCase() === 'god')).toBe(false);
  });

  it('excludes primary folder labels from subject auto-tags', () => {
    const tags = suggestAutoTagsFromNote(
      '10 years ago',
      '<p>10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. I was invited</p>',
      { excludeFolderLabels: ['Salvation'] },
    );
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).not.toContain('salvation');
    expect(tags.some((t) => t.source === 'subject' && t.name.toLowerCase() === 'salvation')).toBe(false);
  });

  it('still detects Ps person tags when folders are excluded', () => {
    const tags = suggestAutoTagsFromNote('', '<p>Ps Johnson led worship and shared about prayer.</p>', {
      excludeFolderLabels: ['Prayer'],
    });
    expect(tags.some((t) => t.name === 'Ps Johnson' && t.source === 'person')).toBe(true);
    expect(tags.some((t) => t.name.toLowerCase() === 'prayer')).toBe(false);
  });

  it('keeps Ps August in the top-12 cap on a dense Passover sermon', () => {
    const body = `Surrendering your life to Jesus is a daily thing.
Ps August
The 10th plague. The Passover.
Exodus 11:1-10
Exodus 12:1-30
Yeast is used as a symbol for sin.
God is enacting his justice on Egypt and Pharaoh.
Romans 6:23
Mercy by the blood of the lamb. Covenant. Salvation.
John 1:29 Matthew 26:26-29 Revelation 5:5-6`;
    const html = body
      .split('\n')
      .map((line) => `<p>${line}</p>`)
      .join('');
    const tags = suggestAutoTagsFromNote('Jesus: our passover lamb', html, {
      excludeFolderLabels: ['Exodus'],
    });
    expect(tags.length).toBeLessThanOrEqual(12);
    expect(tags.some((t) => t.name === 'Ps August' && t.source === 'person')).toBe(true);
  });
});
