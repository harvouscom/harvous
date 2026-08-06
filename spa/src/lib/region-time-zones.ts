/**
 * Narrowing a church's time zone from where it says it is.
 *
 * Two mechanisms, deliberately unequal in size:
 *
 * 1. **Country, from the platform.** `Intl.Locale.getTimeZones()` resolves 13
 *    of the 19 countries Here's My Church covers — GB, IE, FR, NL, BE, IT, AT,
 *    CH, SE, NO, DK, FI, PL — to exactly one zone. For those, and for most of
 *    the world, the region adds nothing and there is nothing to maintain. This
 *    is what makes the feature work in countries HMC has never heard of.
 *
 * 2. **Region, from the table below.** Only needed where a country holds many
 *    zones: US (29), CA (23), AU (12), ES (3), PT (3), DE (2). Only US and CA
 *    are mapped here, because those are the countries with churches; the rest
 *    fall back to the country shortlist rather than have data asserted about
 *    them that nothing yet depends on.
 *
 * A region that genuinely straddles two zones is listed with **both**, never
 * with a guess. Florida is Eastern *and* Central, and a church in Pensacola
 * being handed New York would be a confident wrong answer — worse than a
 * two-item shortlist.
 */

/**
 * Subdivision → the zones it contains, for multi-zone countries only.
 *
 * Keyed `COUNTRY:REGION` so a region code can never collide across countries.
 * Single-entry arrays are exact; multi-entry ones are shortlists for a region
 * the zone boundary cuts through.
 *
 * Zone *boundaries* here change on the order of decades, and always at county
 * level rather than state — so this table is stable in a way a list of zone
 * names would not be.
 */
const REGION_ZONES: Record<string, string[]> = {
  // ─── United States ────────────────────────────────────────────────────────
  // Eastern
  'US:CT': ['America/New_York'],
  'US:DE': ['America/New_York'],
  'US:DC': ['America/New_York'],
  'US:GA': ['America/New_York'],
  'US:ME': ['America/New_York'],
  'US:MD': ['America/New_York'],
  'US:MA': ['America/New_York'],
  'US:NH': ['America/New_York'],
  'US:NJ': ['America/New_York'],
  'US:NY': ['America/New_York'],
  'US:NC': ['America/New_York'],
  'US:OH': ['America/New_York'],
  'US:PA': ['America/New_York'],
  'US:RI': ['America/New_York'],
  'US:SC': ['America/New_York'],
  'US:VT': ['America/New_York'],
  'US:VA': ['America/New_York'],
  'US:WV': ['America/New_York'],
  // Central
  'US:AL': ['America/Chicago'],
  'US:AR': ['America/Chicago'],
  'US:IL': ['America/Chicago'],
  'US:IA': ['America/Chicago'],
  'US:LA': ['America/Chicago'],
  'US:MN': ['America/Chicago'],
  'US:MS': ['America/Chicago'],
  'US:MO': ['America/Chicago'],
  'US:OK': ['America/Chicago'],
  'US:WI': ['America/Chicago'],
  // Mountain
  'US:CO': ['America/Denver'],
  'US:MT': ['America/Denver'],
  'US:NM': ['America/Denver'],
  'US:UT': ['America/Denver'],
  'US:WY': ['America/Denver'],
  // Mountain without daylight saving — its own zone, not a Denver variant.
  'US:AZ': ['America/Phoenix'],
  // Pacific
  'US:CA': ['America/Los_Angeles'],
  'US:WA': ['America/Los_Angeles'],
  'US:NV': ['America/Los_Angeles'],
  // Outside the contiguous zones
  'US:AK': ['America/Anchorage'],
  'US:HI': ['Pacific/Honolulu'],

  // Straddling states — both, never a guess.
  'US:FL': ['America/New_York', 'America/Chicago'],
  // 'America/Indianapolis', not 'America/Indiana/Indianapolis' — the latter is
  // the IANA canonical but is not what engines enumerate, so it would be
  // filtered straight back out of the picker.
  'US:IN': ['America/Indianapolis', 'America/Chicago'],
  'US:KY': ['America/New_York', 'America/Chicago'],
  'US:MI': ['America/Detroit', 'America/Chicago'],
  'US:TN': ['America/New_York', 'America/Chicago'],
  'US:KS': ['America/Chicago', 'America/Denver'],
  'US:NE': ['America/Chicago', 'America/Denver'],
  'US:ND': ['America/Chicago', 'America/Denver'],
  'US:SD': ['America/Chicago', 'America/Denver'],
  'US:TX': ['America/Chicago', 'America/Denver'],
  'US:ID': ['America/Boise', 'America/Los_Angeles'],
  'US:OR': ['America/Los_Angeles', 'America/Boise'],

  // ─── Canada ───────────────────────────────────────────────────────────────
  'CA:NL': ['America/St_Johns'],
  'CA:PE': ['America/Halifax'],
  'CA:NS': ['America/Halifax'],
  'CA:NB': ['America/Moncton'],
  'CA:QC': ['America/Toronto'],
  'CA:MB': ['America/Winnipeg'],
  'CA:AB': ['America/Edmonton'],
  'CA:YT': ['America/Whitehorse'],
  // Straddling provinces and territories.
  'CA:ON': ['America/Toronto', 'America/Winnipeg'],
  'CA:SK': ['America/Regina', 'America/Edmonton'],
  'CA:BC': ['America/Vancouver', 'America/Dawson_Creek'],
  // America/Yellowknife was retired into Edmonton by tzdata; naming it here
  // would silently drop the Northwest Territories from the shortlist.
  'CA:NT': ['America/Edmonton', 'America/Inuvik'],
  'CA:NU': ['America/Iqaluit', 'America/Rankin_Inlet', 'America/Cambridge_Bay'],
};

/**
 * Zones for a subdivision, or `[]` when we hold no data for it.
 *
 * Empty is the honest answer for an unmapped region — the caller falls back to
 * the country shortlist rather than being handed a guess.
 */
export function zonesForRegion(
  country: string | null | undefined,
  region: string | null | undefined,
): string[] {
  const c = String(country ?? '').trim().toUpperCase();
  const r = String(region ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || !r) return [];
  return REGION_ZONES[`${c}:${r}`] ?? [];
}

/** Whether a region resolves to exactly one zone — i.e. we can stop asking. */
export function regionIsExact(
  country: string | null | undefined,
  region: string | null | undefined,
): boolean {
  return zonesForRegion(country, region).length === 1;
}
