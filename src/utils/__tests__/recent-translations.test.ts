/**
 * The pile's memory, and which two of it get an edge.
 *
 * `translationEdges` is the interesting half: it decides what the reader sees above the page, and
 * every one of its rules exists to stop an edge that cannot be used from being drawn.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TRANSLATION_ORDER } from '../../data/translations';
import {
  RECENT_TRANSLATIONS_KEY,
  RECENT_TRANSLATIONS_MAX,
  readRecentTranslations,
  recordTranslationUse,
  translationEdges,
} from '../recent-translations';

/** `TRANSLATION_ORDER` is already a list of ids, not of records. */
const ORDER = TRANSLATION_ORDER;

describe('recording what was read', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps most recent first and moves a repeat to the front', () => {
    recordTranslationUse('NLT');
    recordTranslationUse('ESV');
    expect(readRecentTranslations()).toEqual(['ESV', 'NLT']);

    recordTranslationUse('NLT');
    expect(readRecentTranslations()).toEqual(['NLT', 'ESV']);
  });

  it('normalises case and caps the list', () => {
    expect(recordTranslationUse('esv')).toEqual(['ESV']);
    for (const id of ORDER) recordTranslationUse(id);
    expect(readRecentTranslations()).toHaveLength(RECENT_TRANSLATIONS_MAX);
  });

  it('drops ids that are no longer translations', () => {
    /* The stored list outlives the set. A retired id would otherwise draw an unreadable edge. */
    window.localStorage.setItem(RECENT_TRANSLATIONS_KEY, JSON.stringify(['ESV', 'RETIRED', 'NLT']));
    expect(readRecentTranslations()).toEqual(['ESV', 'NLT']);
  });

  it('reads corrupt or absent storage as empty rather than throwing', () => {
    /* This runs during a render — a throw here is a blank reader. */
    window.localStorage.setItem(RECENT_TRANSLATIONS_KEY, '{not json');
    expect(readRecentTranslations()).toEqual([]);
    window.localStorage.setItem(RECENT_TRANSLATIONS_KEY, JSON.stringify({ nope: true }));
    expect(readRecentTranslations()).toEqual([]);
  });
});

describe('which translations get an edge', () => {
  const edges = (over: Partial<Parameters<typeof translationEdges>[0]> = {}) =>
    translationEdges({ current: 'NLT', recents: [], order: ORDER, count: 2, ...over });

  it('offers the ones you last used, nearest first', () => {
    expect(edges({ recents: ['ESV', 'KJV'] })).toEqual(['ESV', 'KJV']);
  });

  it('never offers the one already on top', () => {
    /* An edge for the page you are reading is a control that does nothing. */
    expect(edges({ recents: ['NLT', 'ESV', 'KJV'] })).toEqual(['ESV', 'KJV']);
  });

  it('backfills from canon order when recency has too few', () => {
    /* First visit: one translation used, and a single edge reads as a mistake, not a stack. */
    const result = edges({ recents: ['ESV'] });
    expect(result[0]).toBe('ESV');
    expect(result).toHaveLength(2);
    expect(result[1]).not.toBe('ESV');
    expect(result[1]).not.toBe('NLT');
  });

  it('reaches past an excluded translation rather than stopping short', () => {
    /* A chapter missing from a version must not cost the reader an edge. */
    const result = edges({ recents: ['ESV', 'KJV', 'NIV'], exclude: ['KJV'] });
    expect(result).toEqual(['ESV', 'NIV']);
  });

  it('never repeats and never exceeds the count', () => {
    expect(edges({ recents: ['ESV', 'ESV', 'esv'], count: 3 })).toHaveLength(3);
    expect(new Set(edges({ recents: ['ESV', 'ESV'], count: 3 })).size).toBe(3);
  });

  it('returns nothing when asked for nothing', () => {
    expect(edges({ count: 0 })).toEqual([]);
  });
});
