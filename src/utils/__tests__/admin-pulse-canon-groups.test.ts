import { describe, expect, it } from 'vitest';
import {
  CANON_BOOK_GROUPS,
  canonGroupForBook,
  canonGroupForBookOrder,
  dominantCanonProfile,
  groupCanonBookCells,
} from '../admin-pulse-canon-groups';

describe('canonGroupForBookOrder', () => {
  it('maps book order to the correct section', () => {
    expect(canonGroupForBookOrder(1)?.id).toBe('law');
    expect(canonGroupForBookOrder(45)?.id).toBe('paul');
    expect(canonGroupForBookOrder(40)?.id).toBe('gospels');
    expect(canonGroupForBookOrder(66)?.id).toBe('revelation');
    expect(canonGroupForBookOrder(0)).toBeNull();
  });
});

describe('canonGroupForBook', () => {
  it('resolves canonical book names', () => {
    expect(canonGroupForBook('Romans')?.id).toBe('paul');
    expect(canonGroupForBook('John')?.id).toBe('gospels');
    expect(canonGroupForBook('Not A Book')).toBeNull();
  });
});

describe('dominantCanonProfile', () => {
  it('returns empty for no books', () => {
    expect(dominantCanonProfile([])).toEqual({
      sectionId: null,
      sectionLabel: null,
      testament: null,
      sectionIds: [],
    });
  });

  it('classifies Romans-heavy notes as Paul', () => {
    const profile = dominantCanonProfile(['Romans', 'Romans', '1 Corinthians']);
    expect(profile.sectionId).toBe('paul');
    expect(profile.sectionLabel).toBe("Paul's letters");
    expect(profile.testament).toBe('nt');
    expect(profile.sectionIds).toEqual(['paul']);
  });

  it('picks dominant section when Gospels and Acts are mixed', () => {
    const gospelsWin = dominantCanonProfile(['Matthew', 'Mark', 'Luke', 'Acts']);
    expect(gospelsWin.sectionId).toBe('gospels');
    expect(gospelsWin.sectionIds).toEqual(['gospels', 'acts']);

    const actsWin = dominantCanonProfile(['Matthew', 'Acts', 'Acts']);
    expect(actsWin.sectionId).toBe('acts');
  });

  it('breaks section ties by earlier canonical book order', () => {
    const profile = dominantCanonProfile(['Matthew', 'Acts']);
    expect(profile.sectionId).toBe('gospels');
  });
});

describe('groupCanonBookCells', () => {
  const cells = Array.from({ length: 66 }, (_, index) => ({
    order: index + 1,
    name: `Book ${index + 1}`,
  }));

  it('splits OT into five sections', () => {
    const groups = groupCanonBookCells(cells, 'ot');
    expect(groups).toHaveLength(5);
    expect(groups[0]?.group.label).toBe('Law');
    expect(groups[0]?.cells).toHaveLength(5);
    expect(groups[4]?.group.label).toBe('Minor prophets');
    expect(groups[4]?.cells).toHaveLength(12);
  });

  it('splits NT into gospels, acts, paul, general letters, and revelation', () => {
    const groups = groupCanonBookCells(cells, 'nt');
    expect(groups.map((g) => g.group.id)).toEqual([
      'gospels',
      'acts',
      'paul',
      'general-epistles',
      'revelation',
    ]);
    expect(groups[0]?.cells).toHaveLength(4);
    expect(groups[2]?.cells).toHaveLength(13);
  });

  it('covers every canonical book order once per testament', () => {
    const otOrders = groupCanonBookCells(cells, 'ot').flatMap((g) => g.cells.map((c) => c.order));
    const ntOrders = groupCanonBookCells(cells, 'nt').flatMap((g) => g.cells.map((c) => c.order));
    expect(otOrders).toEqual(Array.from({ length: 39 }, (_, i) => i + 1));
    expect(ntOrders).toEqual(Array.from({ length: 27 }, (_, i) => i + 40));
    expect(CANON_BOOK_GROUPS).toHaveLength(10);
  });
});
