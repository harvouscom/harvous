import { describe, expect, it } from 'vitest';
import { normalizeSharedSpaceSwitcherId, orderPersonalSharedSpaces } from '../shared-space-switcher-order';

describe('orderPersonalSharedSpaces', () => {
  const spaces = [
    { id: 'space_a', title: 'Alpha' },
    { id: 'space_b', title: 'Bravo' },
    { id: 'space_c', title: 'Charlie' },
  ];

  it('falls back to alpha when no preference', () => {
    expect(orderPersonalSharedSpaces(spaces, null).map((s) => s.id)).toEqual([
      'space_a',
      'space_b',
      'space_c',
    ]);
  });

  it('applies preference then alpha for new spaces', () => {
    expect(orderPersonalSharedSpaces(spaces, ['space_c', 'space_a']).map((s) => s.id)).toEqual([
      'space_c',
      'space_a',
      'space_b',
    ]);
  });

  it('ignores unknown and duplicate preference ids', () => {
    expect(
      orderPersonalSharedSpaces(spaces, ['space_missing', 'space_b', 'b', 'space_b']).map((s) => s.id),
    ).toEqual(['space_b', 'space_a', 'space_c']);
  });

  it('normalizes bare ids', () => {
    expect(normalizeSharedSpaceSwitcherId('xyz')).toBe('space_xyz');
    expect(normalizeSharedSpaceSwitcherId('space_xyz')).toBe('space_xyz');
  });
});
