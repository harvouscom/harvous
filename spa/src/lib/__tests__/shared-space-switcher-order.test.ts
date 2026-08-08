import { describe, expect, it } from 'vitest';
import {
  mergeSwitcherOrder,
  normalizeSharedSpaceSwitcherId,
  orderSwitcherSpaces,
} from '../shared-space-switcher-order';

describe('orderSwitcherSpaces', () => {
  const spaces = [
    { id: 'space_a', title: 'Alpha' },
    { id: 'space_b', title: 'Bravo' },
    { id: 'space_c', title: 'Charlie' },
  ];

  it('falls back to alpha when no preference', () => {
    expect(orderSwitcherSpaces(spaces, null).map((s) => s.id)).toEqual([
      'space_a',
      'space_b',
      'space_c',
    ]);
  });

  it('applies preference then alpha for new spaces', () => {
    expect(orderSwitcherSpaces(spaces, ['space_c', 'space_a']).map((s) => s.id)).toEqual([
      'space_c',
      'space_a',
      'space_b',
    ]);
  });

  it('ignores unknown and duplicate preference ids', () => {
    expect(
      orderSwitcherSpaces(spaces, ['space_missing', 'space_b', 'b', 'space_b']).map((s) => s.id),
    ).toEqual(['space_b', 'space_a', 'space_c']);
  });

  it('normalizes bare ids', () => {
    expect(normalizeSharedSpaceSwitcherId('xyz')).toBe('space_xyz');
    expect(normalizeSharedSpaceSwitcherId('space_xyz')).toBe('space_xyz');
  });

  it('keeps a church list ordered independently of My Home', () => {
    // Both lists read the one stored preference; ids from the other list fall through.
    const stored = ['space_home2', 'space_home1', 'space_ch2', 'space_ch1'];
    const personal = [
      { id: 'space_home1', title: 'Alpha' },
      { id: 'space_home2', title: 'Bravo' },
    ];
    const church = [
      { id: 'space_ch1', title: 'Youth' },
      { id: 'space_ch2', title: 'Young Adults' },
    ];
    expect(orderSwitcherSpaces(personal, stored).map((s) => s.id)).toEqual([
      'space_home2',
      'space_home1',
    ]);
    expect(orderSwitcherSpaces(church, stored).map((s) => s.id)).toEqual([
      'space_ch2',
      'space_ch1',
    ]);
  });
});

describe('mergeSwitcherOrder', () => {
  it('carries the other list through when one list is reordered', () => {
    // Regression guard: writing only the dragged list's ids would drop every id
    // belonging to the other one, so reordering a channel would reset My Home.
    const stored = ['space_home1', 'space_home2', 'space_ch1', 'space_ch2'];
    expect(mergeSwitcherOrder(['space_ch2', 'space_ch1'], stored)).toEqual([
      'space_ch2',
      'space_ch1',
      'space_home1',
      'space_home2',
    ]);
  });

  it('does not duplicate ids the reordered list already claims', () => {
    expect(mergeSwitcherOrder(['space_b', 'space_a'], ['space_a', 'space_b'])).toEqual([
      'space_b',
      'space_a',
    ]);
  });

  it('normalizes both sides and tolerates an empty stored order', () => {
    expect(mergeSwitcherOrder(['b', 'a'], ['a', 'c'])).toEqual(['space_b', 'space_a', 'space_c']);
    expect(mergeSwitcherOrder(['space_a'], null)).toEqual(['space_a']);
    expect(mergeSwitcherOrder(['space_a'], undefined)).toEqual(['space_a']);
  });
});
