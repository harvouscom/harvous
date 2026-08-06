/**
 * Every time zone a church could actually be in.
 *
 * Built from `Intl.supportedValuesOf('timeZone')` rather than a hand-kept list.
 * Harvous has no geographic limit — the server accepts any IANA zone
 * (`normalizeChurchTimezone`) — so a curated set was a client-side ceiling on a
 * product that has none, and it silently made anyone outside North America
 * depend on their browser guessing right. Reading the list from the platform
 * also means new zones and renames arrive for free, which a maintained list
 * would not.
 */
import { zonesForRegion } from './region-time-zones';

/**
 * Fallback for engines without `Intl.supportedValuesOf` (Safari < 15.4).
 *
 * Deliberately spread across continents rather than the old US-only set: if
 * this ever runs, the person is likelier to be somewhere the old list ignored.
 * The detected zone is always merged in on top, so the real answer is reachable
 * even here.
 */
const FALLBACK_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

export type TimeZoneOption = { value: string; label: string };
export type TimeZoneGroup = { region: string; zones: TimeZoneOption[] };

/** The browser's best guess at where this person is, or '' if it can't say. */
export function detectedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function allZoneIds(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) return supported;
  } catch {
    // Fall through — an engine that throws here is one that can't enumerate.
  }
  return FALLBACK_ZONES;
}

/**
 * "GMT-5" for a zone right now, or '' if the engine won't say.
 *
 * `shortOffset` rather than a stored number because offsets move: a zone on
 * daylight saving is one hour different half the year, and anything cached
 * would be wrong for six months at a time.
 */
export function zoneOffsetLabel(zone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** 'America/Argentina/Buenos_Aires' → 'Buenos Aires'. */
export function zoneCityLabel(zone: string): string {
  const tail = zone.split('/').slice(1).join(' · ') || zone;
  return tail.replace(/_/g, ' ');
}

/** 'America/Chicago' → 'America'; a bare 'UTC' groups under itself. */
function zoneRegion(zone: string): string {
  const head = zone.split('/')[0];
  return head.replace(/_/g, ' ');
}

/** The heading for zones matched to the church's own country. */
export const SUGGESTED_REGION = 'Likely for your church';

/**
 * The zones used in a country, from its ISO 3166-1 alpha-2 code.
 *
 * `Intl.Locale.prototype.getTimeZones()` again means no maintained mapping —
 * 'US' yields 29 zones, 'GB' yields exactly one. Anything that isn't a
 * two-letter code returns empty rather than guessing: `Churches.country` is
 * free text denormalized from Here's My Church, so it could just as easily
 * arrive as 'United States', and a wrong suggestion is worse than none.
 */
export function zonesForCountry(country: string | null | undefined): string[] {
  const code = String(country ?? '').trim();
  if (!/^[A-Za-z]{2}$/.test(code)) return [];
  try {
    const locale = new Intl.Locale(`und-${code.toUpperCase()}`) as Intl.Locale & {
      getTimeZones?: () => string[] | undefined;
    };
    return locale.getTimeZones?.() ?? [];
  } catch {
    return [];
  }
}

/**
 * Every zone, grouped by region and labelled for a human.
 *
 * `extra` folds in values that must be selectable even if the platform list
 * omits them — the church's saved zone and the browser's detected one — so a
 * stored value can never become unpickable.
 *
 * `country` and `region` promote the likeliest zones into a short group at the
 * top. Region wins when we hold data for it — Iowa is exactly one zone, where
 * the US as a whole is 29 — and otherwise the country's own list is used, which
 * is already exact for most countries on earth. It **narrows nothing**: the
 * full world stays below, because a church can be registered in one country and
 * gather in another, and a picker that hides the right answer is worse than one
 * that merely buries it.
 */
export function listTimeZoneGroups(
  {
    extra = [],
    country = null,
    region = null,
  }: {
    extra?: (string | null | undefined)[];
    country?: string | null;
    region?: string | null;
  } = {},
  now: Date = new Date(),
): TimeZoneGroup[] {
  const ids = new Set(allZoneIds());
  for (const zone of extra) {
    if (zone && zone.trim()) ids.add(zone.trim());
  }

  const optionFor = (id: string): TimeZoneOption => {
    const offset = zoneOffsetLabel(id, now);
    return { value: id, label: offset ? `${zoneCityLabel(id)} (${offset})` : zoneCityLabel(id) };
  };

  const byRegion = new Map<string, TimeZoneOption[]>();
  for (const id of ids) {
    // Not `region` — that is the church's subdivision, a parameter above.
    const continent = zoneRegion(id);
    const list = byRegion.get(continent);
    if (list) list.push(optionFor(id));
    else byRegion.set(continent, [optionFor(id)]);
  }

  const groups = [...byRegion.entries()]
    .map(([continent, zones]) => ({
      region: continent,
      // Alphabetical inside a region: someone is looking for a city name, not
      // scanning by offset.
      zones: zones.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.region.localeCompare(b.region));

  /*
    Region first, country second. An unmapped region yields nothing rather than
    a guess, so it falls through to the country list on its own.
  */
  const narrowed = zonesForRegion(country, region);
  const source = narrowed.length > 0 ? narrowed : zonesForCountry(country);
  const suggested = source.filter((id) => ids.has(id));
  if (suggested.length === 0) return groups;

  return [
    {
      region: SUGGESTED_REGION,
      zones: suggested.map(optionFor).sort((a, b) => a.label.localeCompare(b.label)),
    },
    ...groups,
  ];
}
