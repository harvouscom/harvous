import { describe, expect, it } from 'vitest';

import { folderLabelsForTagExclusion } from '@/utils/bible-study-concept-overlaps';
import {
  suggestPrimaryCollectionFromNote,
  suggestSecondaryCollectionsFromNote,
} from '@/utils/bible-study-collection-web';
import { suggestAutoTagsFromNote } from '@/utils/bible-study-tag-web';

const LUTHERAN_TESTIMONY_BODY = `
10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. I was invited by my friends. Before this the only scripture I really remembered was John 3:16

Raised Lutheran

My family went to a local Lutheran church in my hometown, where I was born. I didn't know it at the time but now I know that we just went to this church to check a box, especially because our town was essentially closed on Sundays and it was expected to be in church.

I didn't know you could have a relationship with God.

Prayer was this formal sounding way of talking to God and for His honor we'd sit down and stand point numerous times while reading passages and singing hymns. Oh and I was one of those kids that would walk down the aisle at start and end of service to light and put out the candles.

I will say my favorite part was communion. I didn't fully understand what this meant. I just wanted to feel accepted and the juice and fresh bread made Sundays better. Outside of this, the smell of coffee in the fellowship hall and the opportunity to help design the new church building this is all I remember from my time at this church.

Oh, before this church I believe my family and I went to this other Lutheran church in another city between being born and moving back to my hometown. The only thing I remember about this church is the stained glass, natural light, and trees.
`.trim();

function testimonyHtml(body: string = LUTHERAN_TESTIMONY_BODY): string {
  return `<p>${body.replace(/\n\n/g, '</p><p>')}</p>`;
}

describe('Lutheran salvation testimony — tag precision', () => {
  it('does not suggest Marriage or Friendship from spiritual / church-building phrases', () => {
    const html = testimonyHtml();
    const primary = suggestPrimaryCollectionFromNote('', html);
    const secondaries = suggestSecondaryCollectionsFromNote('', html, primary);
    const tags = suggestAutoTagsFromNote('', html, {
      excludeFolderLabels: folderLabelsForTagExclusion(primary, secondaries),
    });
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).not.toContain('marriage');
    expect(names).not.toContain('friendship');
  });

  it('still surfaces on-topic scripture and theme tags', () => {
    const html = testimonyHtml();
    const tags = suggestAutoTagsFromNote('', html);
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).toContain('john');
    expect(names.some((n) => n === 'salvation' || n === 'communion' || n === 'prayer')).toBe(true);
  });

  it('excludeTagNames omits dismissed auto tags from preview suggestions', () => {
    const html = testimonyHtml();
    const tags = suggestAutoTagsFromNote('', html, { excludeTagNames: ['salvation', 'prayer'] });
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).not.toContain('salvation');
    expect(names).not.toContain('prayer');
  });

  it('does not assign Marriage as primary folder', () => {
    const primary = suggestPrimaryCollectionFromNote('', testimonyHtml());
    expect(primary?.toLowerCase()).not.toBe('marriage');
  });

  it('assigns Salvation as primary for the full Lutheran testimony', () => {
    const title = '10 years ago';
    const primary = suggestPrimaryCollectionFromNote(title, testimonyHtml());
    expect(primary).toBe('Salvation');
    const secondaries = suggestSecondaryCollectionsFromNote(title, testimonyHtml(), primary);
    expect(secondaries.map((s) => s.toLowerCase())).not.toContain('family');
    expect(secondaries.map((s) => s.toLowerCase())).not.toContain('prayer');
  });
});

describe('on-topic marriage and friendship — still tagged when clearly the subject', () => {
  it('surfaces Marriage as primary folder and keyword for wedding / spouse prose', () => {
    const title = 'Our wedding day';
    const html =
      '<p>We celebrated our marriage and wedding with family. My spouse and I made vows before God.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, html);
    expect(primary).toBe('Marriage');
    // Keyword is detected for tagging; when Marriage is primary it is excluded from tag chips (folder cascade).
    const rawTags = suggestAutoTagsFromNote(title, html).map((t) => t.name.toLowerCase());
    expect(rawTags).toContain('marriage');
    const folderTags = suggestAutoTagsFromNote(title, html, {
      excludeFolderLabels: folderLabelsForTagExclusion(primary, []),
    }).map((t) => t.name.toLowerCase());
    expect(folderTags).not.toContain('marriage');
  });

  it('surfaces Friendship as primary folder and keyword for explicit friendship prose', () => {
    const title = 'Deep friendship';
    const html =
      '<p>True friendship and companionship have sustained me. Christian fellowship with close friends sharpens my faith.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, html);
    expect(primary).toBe('Friendship');
    const rawTags = suggestAutoTagsFromNote(title, html).map((t) => t.name.toLowerCase());
    expect(rawTags).toContain('friendship');
    const folderTags = suggestAutoTagsFromNote(title, html, {
      excludeFolderLabels: folderLabelsForTagExclusion(primary, []),
    }).map((t) => t.name.toLowerCase());
    expect(folderTags).not.toContain('friendship');
  });

  it('still suppresses Friendship for fellowship hall only', () => {
    const html = '<p>We had coffee in the fellowship hall after church.</p>';
    const tags = suggestAutoTagsFromNote('Sunday', html).map((t) => t.name.toLowerCase());
    expect(tags).not.toContain('friendship');
  });
});
