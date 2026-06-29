import { describe, expect, it } from 'vitest';
import { computeAdminSectionNavMarkerPx, pickAdminSectionNavActiveId } from '../admin-section-nav-active';

const SECTIONS = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
] as const;

describe('pickAdminSectionNavActiveId', () => {
  it('activates the last section whose top is above the marker', () => {
    expect(
      pickAdminSectionNavActiveId(SECTIONS, 200, {
        a: -100,
        b: 80,
        c: 240,
      }),
    ).toBe('b');
  });

  it('selects the last section at scroll bottom', () => {
    expect(
      pickAdminSectionNavActiveId(
        SECTIONS,
        64,
        {
          a: -400,
          b: -200,
          c: 120,
        },
        true,
      ),
    ).toBe('c');
  });
});

describe('computeAdminSectionNavMarkerPx', () => {
  it('places the marker below the sticky nav with a viewport lead', () => {
    expect(computeAdminSectionNavMarkerPx(56, 900)).toBe(236);
    expect(computeAdminSectionNavMarkerPx(56, 500)).toBe(156);
  });
});
