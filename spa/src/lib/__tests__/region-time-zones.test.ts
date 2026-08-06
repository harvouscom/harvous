import { describe, expect, it } from 'vitest';
import { regionIsExact, zonesForRegion } from '../region-time-zones';

describe('zonesForRegion', () => {
  it('resolves an unambiguous US state to exactly one zone', () => {
    // The case that started this: Iowa is 29 US zones narrowed to one.
    expect(zonesForRegion('US', 'IA')).toEqual(['America/Chicago']);
    expect(zonesForRegion('US', 'NY')).toEqual(['America/New_York']);
    expect(zonesForRegion('US', 'CA')).toEqual(['America/Los_Angeles']);
    expect(zonesForRegion('US', 'HI')).toEqual(['Pacific/Honolulu']);
  });

  it('gives Arizona its own zone rather than a Denver variant', () => {
    // Phoenix does not observe daylight saving, so it is genuinely a different
    // zone from Denver for half the year — not a cosmetic distinction.
    expect(zonesForRegion('US', 'AZ')).toEqual(['America/Phoenix']);
  });

  it('returns both zones for a state the boundary cuts through', () => {
    // Never a guess: a church in Pensacola handed New York would be a
    // confident wrong answer, which is worse than a two-item shortlist.
    expect(zonesForRegion('US', 'FL')).toHaveLength(2);
    expect(zonesForRegion('US', 'FL')).toContain('America/Chicago');
    expect(zonesForRegion('US', 'TX')).toHaveLength(2);
    expect(zonesForRegion('US', 'ID')).toHaveLength(2);
  });

  it('handles Canadian provinces, exact and straddling', () => {
    expect(zonesForRegion('CA', 'AB')).toEqual(['America/Edmonton']);
    expect(zonesForRegion('CA', 'NL')).toEqual(['America/St_Johns']);
    expect(zonesForRegion('CA', 'ON').length).toBeGreaterThan(1);
  });

  it('is case and whitespace insensitive', () => {
    expect(zonesForRegion('us', 'ia')).toEqual(['America/Chicago']);
    expect(zonesForRegion(' US ', ' IA ')).toEqual(['America/Chicago']);
  });

  it('returns nothing for a country we hold no region data for', () => {
    // GB, FR and the rest resolve exactly from country alone, so mapping their
    // regions would be dead data.
    expect(zonesForRegion('GB', 'ENG')).toEqual([]);
    expect(zonesForRegion('FR', '75')).toEqual([]);
    expect(zonesForRegion('AU', 'NSW')).toEqual([]);
  });

  it('returns nothing rather than guessing on junk input', () => {
    for (const [c, r] of [
      ['US', 'ZZ'], ['US', ''], ['', 'IA'], [null, null],
      ['United States', 'IA'], ['US', null],
    ] as [string | null, string | null][]) {
      expect(zonesForRegion(c, r), `${c}/${r}`).toEqual([]);
    }
  });

  it('never maps a region to a zone outside its own country', () => {
    // A US state resolving to Europe/… would mean a typo in the table.
    for (const region of ['IA', 'NY', 'CA', 'AK', 'HI', 'FL', 'TX']) {
      for (const zone of zonesForRegion('US', region)) {
        expect(zone, `US/${region} -> ${zone}`).toMatch(/^(America|Pacific)\//);
      }
    }
    for (const region of ['ON', 'AB', 'NL', 'BC']) {
      for (const zone of zonesForRegion('CA', region)) {
        expect(zone, `CA/${region} -> ${zone}`).toMatch(/^America\//);
      }
    }
  });

  it('lists only zones the platform actually knows', () => {
    // A typo'd or retired zone name would silently vanish from the picker,
    // since the grouper filters suggestions against the real list.
    const known = new Set(
      (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf?.('timeZone') ?? [],
    );
    if (known.size === 0) return; // engine can't enumerate; nothing to check
    for (const region of ['IA', 'FL', 'TX', 'IN', 'MI', 'ID', 'OR', 'AZ', 'AK', 'HI']) {
      for (const zone of zonesForRegion('US', region)) {
        expect(known.has(zone), `US/${region}: ${zone} is not a real zone`).toBe(true);
      }
    }
    for (const region of ['ON', 'AB', 'NL', 'BC', 'SK', 'NT', 'NU', 'QC', 'MB', 'YT', 'NS', 'NB', 'PE']) {
      for (const zone of zonesForRegion('CA', region)) {
        expect(known.has(zone), `CA/${region}: ${zone} is not a real zone`).toBe(true);
      }
    }
  });
});

describe('regionIsExact', () => {
  it('is true only when one zone remains', () => {
    expect(regionIsExact('US', 'IA')).toBe(true);
    expect(regionIsExact('US', 'FL')).toBe(false);
    expect(regionIsExact('US', 'ZZ')).toBe(false);
    expect(regionIsExact('GB', 'ENG')).toBe(false);
  });
});
