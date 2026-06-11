import { describe, expect, it } from 'vitest';
import { folderLabelsForTagExclusion } from '@/utils/bible-study-concept-overlaps';
import {
  suggestPrimaryCollectionFromNote,
  suggestSecondaryCollectionsFromNote,
} from '@/utils/bible-study-collection-web';
import { suggestAutoTagsFromNote } from '@/utils/bible-study-tag-web';

const SALVATION_TESTIMONY_TITLE = '10 years ago';
const SALVATION_TESTIMONY_BODY =
  '<p>10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. I was invited</p>';

describe('folder / tag hierarchy — salvation testimony', () => {
  it('assigns Salvation as primary with no secondary folders', () => {
    const primary = suggestPrimaryCollectionFromNote(SALVATION_TESTIMONY_TITLE, SALVATION_TESTIMONY_BODY);
    expect(primary).toBe('Salvation');
    const secondaries = suggestSecondaryCollectionsFromNote(
      SALVATION_TESTIMONY_TITLE,
      SALVATION_TESTIMONY_BODY,
      primary,
    );
    expect(secondaries).toEqual([]);
  });

  it('excludes folder labels from auto-tags', () => {
    const primary = suggestPrimaryCollectionFromNote(SALVATION_TESTIMONY_TITLE, SALVATION_TESTIMONY_BODY);
    const secondaries = suggestSecondaryCollectionsFromNote(
      SALVATION_TESTIMONY_TITLE,
      SALVATION_TESTIMONY_BODY,
      primary,
    );
    const excludeFolderLabels = folderLabelsForTagExclusion(primary, secondaries);
    const tags = suggestAutoTagsFromNote(SALVATION_TESTIMONY_TITLE, SALVATION_TESTIMONY_BODY, {
      excludeFolderLabels,
    });
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).not.toContain('salvation');
    expect(names).not.toContain('redemption');
  });
});

describe('folder / tag hierarchy — secondary gates', () => {
  it('does not promote Redemption as secondary when Salvation is primary', () => {
    const body =
      '<p>I raised my hand during a salvation call and shared my testimony about grace.</p>';
    const secs = suggestSecondaryCollectionsFromNote('Testimony', body, 'Salvation');
    expect(secs.some((s) => s.toLowerCase() === 'redemption')).toBe(false);
  });

  it('omits weak single-mention theme secondary folders', () => {
    const title = 'Sunday visit';
    const body =
      '<p>We visited a church downtown once while traveling. It was a nice building and friendly people.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    if (!primary) return;
    const secs = suggestSecondaryCollectionsFromNote(title, body, primary);
    expect(secs.length).toBe(0);
  });
});
