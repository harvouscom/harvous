/**
 * Reading preferences, and the v1 → v2 text-size migration.
 *
 * The scale was recentred (small was 17, is now 15) while the names stayed the same, so a
 * stored preference silently changed meaning. These pin the migration by *point size*,
 * which is the thing a reader actually chose.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_READING_PREFS,
  READER_TEXT_SIZES,
  readReadingPrefs,
  writeReadingPrefs,
} from '../proto-reading-prefs';

const KEY = 'harvous-proto-reading-prefs';
const px = (id: string) => READER_TEXT_SIZES.find((s) => s.id === id)!.px;

describe('reading prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to prose at the middle size with verse numbers on', () => {
    expect(readReadingPrefs()).toEqual({
      textSize: 'medium',
      showVerseNumbers: true,
      verseLayout: 'prose',
      showMarginNotes: true,
    });
    // The default must be the comfortable middle, not the smallest option.
    expect(px('medium')).toBe(17);
  });

  it('round-trips a written preference', () => {
    writeReadingPrefs({
      textSize: 'large',
      showVerseNumbers: false,
      verseLayout: 'lines',
      showMarginNotes: false,
    });
    expect(readReadingPrefs()).toEqual({
      textSize: 'large',
      showVerseNumbers: false,
      verseLayout: 'lines',
      showMarginNotes: false,
    });
  });

  it('fills a field added after the blob was written, without a version bump', () => {
    /*
     * A v2 blob saved before `showMarginNotes` existed. Each field falls back independently,
     * so the missing key lands on its default and the rest survive untouched — which is why
     * adding it needed no version bump. Bumping would have been actively wrong: it would
     * re-run the v1 text-size migration over an already-migrated value.
     */
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 2, textSize: 'large', showVerseNumbers: false, verseLayout: 'lines' }),
    );
    expect(readReadingPrefs()).toEqual({
      textSize: 'large',
      showVerseNumbers: false,
      verseLayout: 'lines',
      showMarginNotes: true,
    });
  });

  it('stamps a version so later scale changes can migrate', () => {
    writeReadingPrefs(DEFAULT_READING_PREFS);
    expect(JSON.parse(localStorage.getItem(KEY)!).version).toBeGreaterThanOrEqual(2);
  });

  describe('v1 migration keeps the size the reader chose', () => {
    // v1: small=17 medium=19 large=21 xlarge=24 — no `version` field.
    it.each([
      ['small', 17, 'medium'],
      ['medium', 19, 'large'],
    ])('v1 %s (%ipx) becomes %s at the same size', (v1, v1px, expected) => {
      localStorage.setItem(KEY, JSON.stringify({ textSize: v1, showVerseNumbers: true }));
      const migrated = readReadingPrefs().textSize;
      expect(migrated).toBe(expected);
      expect(px(migrated)).toBe(v1px);
    });

    it.each([
      ['large', 21],
      ['xlarge', 24],
    ])('v1 %s (%ipx) clamps to the largest step that still exists', (v1) => {
      localStorage.setItem(KEY, JSON.stringify({ textSize: v1, showVerseNumbers: true }));
      expect(readReadingPrefs().textSize).toBe('large');
    });

    it('does not re-migrate an already-v2 value', () => {
      // Without the version gate this would read as v1 'small' and jump to 'medium'.
      localStorage.setItem(
        KEY,
        JSON.stringify({ textSize: 'small', showVerseNumbers: true, verseLayout: 'prose', version: 2 }),
      );
      expect(readReadingPrefs().textSize).toBe('small');
    });

    it('gives a v1 record the new layout default', () => {
      localStorage.setItem(KEY, JSON.stringify({ textSize: 'small', showVerseNumbers: true }));
      expect(readReadingPrefs().verseLayout).toBe('prose');
    });
  });

  it('falls back to defaults on unreadable or nonsense values', () => {
    localStorage.setItem(KEY, 'not json');
    expect(readReadingPrefs()).toEqual(DEFAULT_READING_PREFS);

    localStorage.setItem(KEY, JSON.stringify({ textSize: 'gigantic', verseLayout: 'sideways', version: 2 }));
    expect(readReadingPrefs()).toEqual(DEFAULT_READING_PREFS);
  });
});
