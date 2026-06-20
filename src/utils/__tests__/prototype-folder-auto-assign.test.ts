import { describe, expect, it } from 'vitest';
import type { CollectionChromeState } from '../bible-study-collection-web';
import {
  applyIdleFolderAutoAssign,
  clearAutoFolderChrome,
  hasAutoFolderBodyContent,
  noteHasFolderSuggestContent,
} from '../prototype-folder-auto-assign';

const emptyChrome: CollectionChromeState = {
  primaryCollection: null,
  secondaryCollections: [],
  collectionPinned: false,
  collectionUserOverride: false,
  collectionLastAutoUpdatedAtIso: null,
};

const SALVATION_BODY =
  '<p>10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. ' +
  'I was invited forward and prayed with a pastor named Paul.</p>';

describe('hasAutoFolderBodyContent', () => {
  it('returns false for empty TipTap body', () => {
    expect(hasAutoFolderBodyContent('<p></p>')).toBe(false);
    expect(hasAutoFolderBodyContent('')).toBe(false);
  });

  it('returns true when body has text', () => {
    expect(hasAutoFolderBodyContent('<p>Hello world</p>')).toBe(true);
  });
});

describe('noteHasFolderSuggestContent', () => {
  it('requires body text, not title alone', () => {
    expect(noteHasFolderSuggestContent('Romans study', '<p></p>')).toBe(false);
    expect(noteHasFolderSuggestContent('', SALVATION_BODY)).toBe(true);
  });
});

describe('applyIdleFolderAutoAssign', () => {
  const now = new Date('2026-06-11T12:00:00.000Z');

  it('does not assign primary for title-only note', () => {
    const result = applyIdleFolderAutoAssign(emptyChrome, 'Romans study', '<p></p>', now);
    expect(result.primaryCollection).toBeNull();
    expect(result.secondaryCollections).toEqual([]);
  });

  it('assigns primary when body has matching content', () => {
    const result = applyIdleFolderAutoAssign(emptyChrome, '10 years ago', SALVATION_BODY, now);
    expect(result.primaryCollection).toBe('Salvation');
  });

  it('clears existing primary when body is removed', () => {
    const withPrimary: CollectionChromeState = {
      ...emptyChrome,
      primaryCollection: 'Salvation',
      secondaryCollections: ['Grace'],
      collectionLastAutoUpdatedAtIso: now.toISOString(),
    };
    const result = applyIdleFolderAutoAssign(withPrimary, '10 years ago', '<p></p>', now);
    expect(result.primaryCollection).toBeNull();
    expect(result.secondaryCollections).toEqual([]);
    expect(result.collectionLastAutoUpdatedAtIso).toBeNull();
  });

  it('preserves pinned primary when body is cleared', () => {
    const pinned: CollectionChromeState = {
      ...emptyChrome,
      primaryCollection: 'Salvation',
      collectionPinned: true,
    };
    const result = applyIdleFolderAutoAssign(pinned, '10 years ago', '<p></p>', now);
    expect(result.primaryCollection).toBe('Salvation');
    expect(result.secondaryCollections).toEqual([]);
  });

  it('skips auto updates when manually overridden without pin', () => {
    const manual: CollectionChromeState = {
      ...emptyChrome,
      primaryCollection: 'Prayer',
      collectionUserOverride: true,
    };
    const result = applyIdleFolderAutoAssign(manual, '', SALVATION_BODY, now);
    expect(result.primaryCollection).toBe('Prayer');
  });

  it('re-ranks primary to the best candidate immediately after a prior auto-update (no cooldown)', () => {
    const stale: CollectionChromeState = {
      ...emptyChrome,
      primaryCollection: 'Faith',
      // Auto-updated "just now" — the old 25s cooldown would have frozen the primary here.
      collectionLastAutoUpdatedAtIso: now.toISOString(),
    };
    const result = applyIdleFolderAutoAssign(stale, '10 years ago', SALVATION_BODY, now);
    expect(result.primaryCollection).toBe('Salvation');
  });

  it('holds the primary when the content-boundary gate disallows a change (mid-word typing)', () => {
    const stale: CollectionChromeState = {
      ...emptyChrome,
      primaryCollection: 'Faith',
      collectionLastAutoUpdatedAtIso: now.toISOString(),
    };
    const held = applyIdleFolderAutoAssign(stale, '10 years ago', SALVATION_BODY, now, false);
    expect(held.primaryCollection).toBe('Faith');
  });
});

describe('applyIdleFolderAutoAssign — curated subjects (content-first)', () => {
  const now = new Date('2026-06-11T12:00:00.000Z');

  it('adds curated passage subjects when the prose names no theme', () => {
    // Cites Romans 8 but says no theme word; Romans 8 subjects: Sanctification / Death / Suffering…
    const result = applyIdleFolderAutoAssign(emptyChrome, '', '<p>Been sitting with Romans 8:28 today.</p>', now);
    const all = [result.primaryCollection, ...result.secondaryCollections].filter(Boolean) as string[];
    expect(all.some((f) => ['Sanctification', 'Death', 'Suffering', 'Holy Spirit'].includes(f))).toBe(true);
  });

  it('prefers what the note actually says (content) over passage subjects', () => {
    const result = applyIdleFolderAutoAssign(emptyChrome, '', '<p>Wrestling with fear and anxiety while reading John 3:16.</p>', now);
    const all = [result.primaryCollection, ...result.secondaryCollections].filter(Boolean) as string[];
    expect(all).toContain('Fear');
  });

  it('never adds tag-level specifics (genealogy people) as folders', () => {
    const result = applyIdleFolderAutoAssign(emptyChrome, '', '<p>Reading the genealogy in Matthew 1:12-13.</p>', now);
    const all = [result.primaryCollection, ...result.secondaryCollections].filter(Boolean) as string[];
    expect(all.some((f) => ['Jehoiachin', 'Shealtiel', 'Zerubbabel'].includes(f))).toBe(false);
  });
});

describe('clearAutoFolderChrome', () => {
  it('clears auto-assigned folder fields', () => {
    const cleared = clearAutoFolderChrome({
      ...emptyChrome,
      primaryCollection: 'Faith',
      secondaryCollections: ['Hope'],
      collectionLastAutoUpdatedAtIso: '2026-01-01T00:00:00.000Z',
    });
    expect(cleared.primaryCollection).toBeNull();
    expect(cleared.secondaryCollections).toEqual([]);
    expect(cleared.collectionLastAutoUpdatedAtIso).toBeNull();
  });
});
