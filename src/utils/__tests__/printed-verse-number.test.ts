import { describe, expect, it } from 'vitest';
import nabre from '@/data/printed-verse-numbers/NABRE.json';
import drb from '@/data/printed-verse-numbers/DRB.json';
import {
  formatPrintedVerse,
  hasPrintedVerseNumbers,
  printedVerseFor,
  type PrintedVerseMap,
} from '../printed-verse-number';

const NABRE = nabre as PrintedVerseMap;
const DRB = drb as PrintedVerseMap;

const shown = (map: PrintedVerseMap, book: string, chapter: number, verse: number) => {
  const p = printedVerseFor(map, book, chapter, verse);
  return p ? formatPrintedVerse(p, book, chapter) : null;
};

describe('printed verse numbers', () => {
  it('gives the NABRE and Douay-Rheims numbers for "Create in me a clean heart"', () => {
    expect(shown(NABRE, 'Psalms', 51, 10)).toBe('12');
    expect(shown(DRB, 'Psalms', 51, 10)).toBe('50:12');
  });

  it('follows the Vulgate Psalm numbering in the Douay-Rheims', () => {
    expect(shown(DRB, 'Psalms', 23, 1)).toBe('22:1');
  });

  it("files the Prayer of Azariah under Daniel, where it's printed", () => {
    expect(shown(NABRE, 'Prayer of Azariah', 1, 1)).toBe('Daniel 3:24');
  });

  it('shows nothing where the edition prints the same number', () => {
    expect(shown(NABRE, 'John', 3, 16)).toBeNull();
    expect(shown(NABRE, 'John', 7, 53)).toBeNull();
    expect(shown(NABRE, 'Genesis', 1, 1)).toBeNull();
  });

  it('knows which translations have a map', () => {
    expect(hasPrintedVerseNumbers('NABRE')).toBe(true);
    expect(hasPrintedVerseNumbers('DRB')).toBe(true);
    expect(hasPrintedVerseNumbers('ESV')).toBe(false);
  });
});
