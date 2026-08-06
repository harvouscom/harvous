import { describe, expect, it } from 'vitest';
import {
  listTimeZoneGroups,
  zoneCityLabel,
  zoneOffsetLabel,
  zonesForCountry,
  SUGGESTED_REGION,
} from '../time-zone-options';

/** Mid-January: northern hemisphere on standard time, southern on daylight. */
const WINTER = new Date('2026-01-15T12:00:00Z');
/** Mid-July: the reverse, which is what catches a hardcoded offset. */
const SUMMER = new Date('2026-07-15T12:00:00Z');

describe('zoneCityLabel', () => {
  it('reads the city, not the identifier', () => {
    expect(zoneCityLabel('America/Chicago')).toBe('Chicago');
    expect(zoneCityLabel('Europe/London')).toBe('London');
    expect(zoneCityLabel('Africa/Nairobi')).toBe('Nairobi');
  });

  it('un-snakes multi-word cities', () => {
    expect(zoneCityLabel('America/Los_Angeles')).toBe('Los Angeles');
    expect(zoneCityLabel('Pacific/Port_Moresby')).toBe('Port Moresby');
  });

  it('keeps the middle segment of a three-part zone', () => {
    // Dropping it would render several distinct US zones identically.
    expect(zoneCityLabel('America/Argentina/Buenos_Aires')).toBe('Argentina · Buenos Aires');
    expect(zoneCityLabel('America/Indiana/Knox')).toBe('Indiana · Knox');
  });

  it('leaves a single-segment zone alone', () => {
    expect(zoneCityLabel('UTC')).toBe('UTC');
  });
});

describe('zoneOffsetLabel', () => {
  it('follows daylight saving rather than reporting a fixed offset', () => {
    // Chicago is GMT-6 in January and GMT-5 in July. A stored number would be
    // wrong for half of every year.
    expect(zoneOffsetLabel('America/Chicago', WINTER)).toBe('GMT-6');
    expect(zoneOffsetLabel('America/Chicago', SUMMER)).toBe('GMT-5');
  });

  it('handles the southern hemisphere, where the seasons invert', () => {
    expect(zoneOffsetLabel('Australia/Sydney', WINTER)).toBe('GMT+11');
    expect(zoneOffsetLabel('Australia/Sydney', SUMMER)).toBe('GMT+10');
  });

  it('handles a zone that never shifts', () => {
    expect(zoneOffsetLabel('America/Phoenix', WINTER)).toBe('GMT-7');
    expect(zoneOffsetLabel('America/Phoenix', SUMMER)).toBe('GMT-7');
  });

  it('returns empty rather than throwing on nonsense', () => {
    expect(zoneOffsetLabel('Mars/Olympus', WINTER)).toBe('');
  });
});

describe('listTimeZoneGroups', () => {
  it('covers every inhabited continent, not just North America', () => {
    // The regression this file exists for: the picker used to be a nine-entry
    // US/Canada list on a product with no geographic limit.
    const regions = listTimeZoneGroups({}, WINTER).map((g) => g.region);
    for (const region of ['Africa', 'America', 'Asia', 'Australia', 'Europe', 'Pacific']) {
      expect(regions, region).toContain(region);
    }
  });

  it('finds churches well outside the old list', () => {
    const all = listTimeZoneGroups({}, WINTER).flatMap((g) => g.zones.map((z) => z.value));
    for (const zone of ['Europe/London', 'Africa/Lagos', 'Asia/Manila', 'Pacific/Auckland']) {
      expect(all, zone).toContain(zone);
    }
  });

  it('labels a zone with its city and current offset', () => {
    const americas = listTimeZoneGroups({}, WINTER).find((g) => g.region === 'America');
    const chicago = americas?.zones.find((z) => z.value === 'America/Chicago');
    expect(chicago?.label).toBe('Chicago (GMT-6)');
  });

  it('sorts regions, and cities within them', () => {
    const groups = listTimeZoneGroups({}, WINTER);
    const regions = groups.map((g) => g.region);
    expect(regions).toEqual([...regions].sort((a, b) => a.localeCompare(b)));
    for (const group of groups) {
      const labels = group.zones.map((z) => z.label);
      expect(labels, group.region).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    }
  });

  it('never drops a saved zone, so a stored value stays pickable', () => {
    // Even a zone this engine does not enumerate must remain selectable —
    // otherwise editing any other setting would silently blank it.
    const groups = listTimeZoneGroups({ extra: ['Antarctica/Troll', null, undefined, '  '] }, WINTER);
    const all = groups.flatMap((g) => g.zones.map((z) => z.value));
    expect(all).toContain('Antarctica/Troll');
    expect(all.filter((z) => !z.trim())).toHaveLength(0);
  });

  it('lists each zone once even when it is also passed as extra', () => {
    const groups = listTimeZoneGroups({ extra: ['America/Chicago'] }, WINTER);
    const all = groups.flatMap((g) => g.zones.map((z) => z.value));
    expect(all.filter((z) => z === 'America/Chicago')).toHaveLength(1);
  });
});

/**
 * Stub `Intl.Locale.prototype.getTimeZones`, which Node does not implement
 * (Chrome and Safari 17+ do).
 *
 * Stubbed rather than skipped so the suggestion logic is tested identically on
 * every engine — and so the *unsupported* path below is tested too, since that
 * is what Node, and any older browser, actually runs.
 */
const ZONES_BY_COUNTRY: Record<string, string[]> = {
  GB: ['Europe/London'],
  US: [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
    'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
    'America/Detroit', 'America/Indiana/Knox', 'America/Boise',
  ],
};

function withCountryZones<T>(run: () => T): T {
  const proto = Intl.Locale.prototype as unknown as { getTimeZones?: () => string[] };
  const had = Object.prototype.hasOwnProperty.call(proto, 'getTimeZones');
  const original = proto.getTimeZones;
  proto.getTimeZones = function getTimeZones(this: Intl.Locale) {
    return ZONES_BY_COUNTRY[String(this).replace(/^und-/, '').toUpperCase()] ?? [];
  };
  try {
    return run();
  } finally {
    if (had) proto.getTimeZones = original;
    else delete proto.getTimeZones;
  }
}

describe('zonesForCountry', () => {
  it('maps a country code to its zones', () => {
    withCountryZones(() => {
      expect(zonesForCountry('GB')).toEqual(['Europe/London']);
      expect(zonesForCountry('US')).toContain('America/Chicago');
      expect(zonesForCountry('us')).toContain('America/Chicago');
    });
  });

  it('returns nothing for anything that is not a two-letter code', () => {
    // `Churches.country` is free text denormalized from Here's My Church, so
    // it can arrive as a name. A wrong suggestion is worse than none.
    withCountryZones(() => {
      for (const bad of ['United States', 'USA', '', null, undefined, 'U']) {
        expect(zonesForCountry(bad), String(bad)).toEqual([]);
      }
    });
  });

  it('degrades to no suggestions on an engine without the API', () => {
    // Node today, and any browser before Safari 17. The picker must still work,
    // just without the shortlist.
    expect(zonesForCountry('GB')).toEqual([]);
  });
});

describe('country suggestions', () => {
  it('puts the church country first without hiding the rest', () => {
    withCountryZones(() => {
      const groups = listTimeZoneGroups({ country: 'GB' }, WINTER);
      expect(groups[0].region).toBe(SUGGESTED_REGION);
      expect(groups[0].zones.map((z) => z.value)).toEqual(['Europe/London']);
      // The whole world is still reachable underneath — a church can be
      // registered in one country and gather in another.
      const rest = groups.slice(1).flatMap((g) => g.zones.map((z) => z.value));
      expect(rest).toContain('Asia/Manila');
      expect(rest).toContain('America/Chicago');
      expect(rest).toContain('Europe/London');
    });
  });

  it('suggests a shortlist for a large country', () => {
    withCountryZones(() => {
      const groups = listTimeZoneGroups({ country: 'US' }, WINTER);
      expect(groups[0].region).toBe(SUGGESTED_REGION);
      // A shortlist, not a single guess, and far short of the full list.
      expect(groups[0].zones.length).toBeGreaterThan(5);
      expect(groups[0].zones.length).toBeLessThan(60);
    });
  });

  it('adds no group when the country is unknown or unmapped', () => {
    // The state today: `country` is null on real churches, so this is the path
    // that actually runs, and it must equal the old behaviour exactly.
    withCountryZones(() => {
      const without = listTimeZoneGroups({}, WINTER);
      const unknown = listTimeZoneGroups({ country: 'United States' }, WINTER);
      expect(without[0].region).not.toBe(SUGGESTED_REGION);
      expect(unknown.map((g) => g.region)).toEqual(without.map((g) => g.region));
    });
  });
});

describe('region narrowing', () => {
  it('narrows a US state to one suggestion instead of 29', () => {
    // The whole point: New Hope is in Iowa, so the picker should offer one
    // zone, not the country's entire list.
    withCountryZones(() => {
      const groups = listTimeZoneGroups({ country: 'US', region: 'IA' }, WINTER);
      expect(groups[0].region).toBe(SUGGESTED_REGION);
      expect(groups[0].zones.map((z) => z.value)).toEqual(['America/Chicago']);
    });
  });

  it('falls back to the country list for a straddling state', () => {
    withCountryZones(() => {
      const florida = listTimeZoneGroups({ country: 'US', region: 'FL' }, WINTER);
      expect(florida[0].zones.map((z) => z.value).sort()).toEqual(
        ['America/Chicago', 'America/New_York'].sort(),
      );
    });
  });

  it('falls back to the country when the region is unmapped', () => {
    // GB resolves exactly from country alone, so its regions are never mapped.
    withCountryZones(() => {
      const groups = listTimeZoneGroups({ country: 'GB', region: 'ENG' }, WINTER);
      expect(groups[0].zones.map((z) => z.value)).toEqual(['Europe/London']);
    });
  });

  it('ignores a region when no country is known', () => {
    // A bare 'IA' means nothing without the country that scopes it.
    withCountryZones(() => {
      const groups = listTimeZoneGroups({ region: 'IA' }, WINTER);
      expect(groups[0].region).not.toBe(SUGGESTED_REGION);
    });
  });

  it('needs no country API for a region hit', () => {
    // Region data is local, so narrowing works even on an engine without
    // Intl.Locale.getTimeZones — the path Node actually runs.
    const groups = listTimeZoneGroups({ country: 'US', region: 'IA' }, WINTER);
    expect(groups[0].region).toBe(SUGGESTED_REGION);
    expect(groups[0].zones.map((z) => z.value)).toEqual(['America/Chicago']);
  });
});
