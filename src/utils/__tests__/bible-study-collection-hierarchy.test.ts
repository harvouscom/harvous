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

  it('caps auto secondary folders at three', () => {
    const title = 'The patriarchs';
    const body =
      '<p>This is about grace. Grace shows up again and again as grace. ' +
      'Abraham trusted God; Abraham waited; Abraham believed. ' +
      'Isaac was the promised son; Isaac grew; Isaac later married. ' +
      'Jacob wrestled; Jacob fled; Jacob returned home. ' +
      'Joseph dreamed; Joseph suffered; Joseph forgave them.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Grace');
    const secs = suggestSecondaryCollectionsFromNote(title, body, primary);
    expect(secs.length).toBe(3);
  });
});

describe('folder / tag hierarchy — names and generic terms do not beat the real theme', () => {
  it('keeps a recurring spiritual theme as primary over incidental book and character mentions', () => {
    const title = 'Study notes';
    const body =
      '<p>This passage is really about grace. Grace meets us where we are, and grace keeps ' +
      'working in us long after. Paul wrote about it in his letter to the Romans.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Grace');
  });

  it('prefers a recurring specific theme over a single generic-theme mention', () => {
    const title = 'Notes';
    const body =
      '<p>We talked a lot about forgiveness today. Forgiveness is hard, but forgiveness ' +
      'frees us to move forward. I also felt some joy while we prayed together quietly.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Forgiveness');
  });
});
