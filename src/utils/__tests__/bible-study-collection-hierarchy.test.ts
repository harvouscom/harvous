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

describe('folder / tag hierarchy — Bible books are folder-only-when-primary', () => {
  it('keeps a cited book out of secondary folders and surfaces it as a tag instead', () => {
    const title = 'Notes on grace';
    const body =
      '<p>This passage is really about grace. Grace meets us where we are, and grace keeps ' +
      'working in us. We read 1 Peter 2:9 and 1 Peter 1:3 together.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Grace');
    const secondaries = suggestSecondaryCollectionsFromNote(title, body, primary);
    expect(secondaries.some((s) => s.toLowerCase() === '1 peter')).toBe(false);
    // The apostle "Peter" (tail of the book name) must not leak in as a folder from a citation.
    expect(secondaries.some((s) => s.toLowerCase() === 'peter')).toBe(false);

    const excludeFolderLabels = folderLabelsForTagExclusion(primary, secondaries);
    const tags = suggestAutoTagsFromNote(title, body, { excludeFolderLabels });
    const names = tags.map((t) => t.name.toLowerCase());
    expect(names).toContain('1 peter');
  });

  it('makes a single book the primary but keeps other cited books as tags, not secondaries', () => {
    const title = 'Study notes';
    const body =
      '<p>We worked through Romans today. Romans builds its case carefully, and Romans returns ' +
      'again to the same theme. We glanced once at Galatians 5:1 for comparison.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Romans');
    const secondaries = suggestSecondaryCollectionsFromNote(title, body, primary);
    expect(secondaries.some((s) => s.toLowerCase() === 'galatians')).toBe(false);
  });

  it('lets a book-study win primary when the book is in the title', () => {
    const title = '1 Peter';
    const body =
      '<p>Peter writes to scattered believers about living hope and holy conduct in a hostile ' +
      'world. He grounds their identity in being chosen and set apart.</p>';
    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('1 Peter');
  });
});
