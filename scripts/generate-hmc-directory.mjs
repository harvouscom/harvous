#!/usr/bin/env node
/**
 * Regenerate src/utils/hmc-directory.ts from a local Here’s My Church checkout.
 *
 * Usage:
 *   HMC_ROOT=/path/to/heresmychurch node scripts/generate-hmc-directory.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const hmcRoot = process.env.HMC_ROOT || path.resolve(root, '../heresmychurch');
const intlPath = path.join(hmcRoot, 'supabase/functions/make-server-283d8046/regions-intl.ts');

if (!fs.existsSync(intlPath)) {
  console.error(`Missing ${intlPath}. Set HMC_ROOT to your heresmychurch checkout.`);
  process.exit(1);
}

const src = fs.readFileSync(intlPath, 'utf8');
const start = src.indexOf('export const INTL_REGIONS:Record<string,IntlRegion>=');
if (start < 0) throw new Error('INTL_REGIONS not found');
const brace = src.indexOf('{', start);
let depth = 0;
let end = -1;
for (let i = brace; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') {
    depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
}
const data = Function(`"use strict"; return (${src.slice(brace, end + 1)});`)();

const COUNTRY_META = {
  US: { name: 'United States', regionNoun: { one: 'state', many: 'states' } },
  CA: { name: 'Canada', regionNoun: { one: 'province', many: 'provinces and territories' } },
  GB: { name: 'United Kingdom', regionNoun: { one: 'region', many: 'regions' } },
  IE: { name: 'Ireland', regionNoun: { one: 'county', many: 'counties' } },
  FR: { name: 'France', regionNoun: { one: 'department', many: 'departments' } },
  DE: { name: 'Germany', regionNoun: { one: 'state', many: 'states' } },
  NL: { name: 'Netherlands', regionNoun: { one: 'province', many: 'provinces' } },
  BE: { name: 'Belgium', regionNoun: { one: 'province', many: 'provinces' } },
  ES: { name: 'Spain', regionNoun: { one: 'province', many: 'provinces' } },
  IT: { name: 'Italy', regionNoun: { one: 'province', many: 'provinces' } },
  PT: { name: 'Portugal', regionNoun: { one: 'district', many: 'districts' } },
  AT: { name: 'Austria', regionNoun: { one: 'state', many: 'states' } },
  CH: { name: 'Switzerland', regionNoun: { one: 'canton', many: 'cantons' } },
  SE: { name: 'Sweden', regionNoun: { one: 'county', many: 'counties' } },
  NO: { name: 'Norway', regionNoun: { one: 'county', many: 'counties' } },
  DK: { name: 'Denmark', regionNoun: { one: 'region', many: 'regions' } },
  FI: { name: 'Finland', regionNoun: { one: 'region', many: 'regions' } },
  PL: { name: 'Poland', regionNoun: { one: 'voivodeship', many: 'voivodeships' } },
  AU: { name: 'Australia', regionNoun: { one: 'state', many: 'states' } },
};

const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
];

const byCc = {};
for (const row of Object.values(data)) {
  if (!byCc[row.cc]) byCc[row.cc] = [];
  byCc[row.cc].push({ code: row.a, label: row.n });
}
for (const list of Object.values(byCc)) list.sort((a, b) => a.label.localeCompare(b.label));
byCc.US = US_STATES.map(([code, label]) => ({ code, label }));

const order = Object.keys(COUNTRY_META);
const usCodes = new Set(US_STATES.map(([c]) => c));
const lines = [];
lines.push('/**');
lines.push(" * Here’s My Church directory countries + admin-1 regions.");
lines.push(' * Generated from heresmychurch regions-intl + US states — do not hand-edit region lists.');
lines.push(' * Regenerate: HMC_ROOT=../heresmychurch node scripts/generate-hmc-directory.mjs');
lines.push(' */');
lines.push('');
lines.push('export type HmcRegionOption = { code: string; label: string };');
lines.push('');
lines.push('export type HmcCountryConfig = {');
lines.push('  code: string;');
lines.push('  name: string;');
lines.push('  regionNoun: { one: string; many: string };');
lines.push('};');
lines.push('');
lines.push('export const HMC_COUNTRIES: ReadonlyArray<HmcCountryConfig> = [');
for (const cc of order) {
  const m = COUNTRY_META[cc];
  lines.push(
    `  { code: '${cc}', name: '${m.name.replace(/'/g, "\\'")}', regionNoun: { one: '${m.regionNoun.one}', many: '${m.regionNoun.many}' } },`,
  );
}
lines.push('];');
lines.push('');
lines.push('export const HMC_COUNTRY_CODES: ReadonlySet<string> = new Set(HMC_COUNTRIES.map((c) => c.code));');
lines.push('');
lines.push('/** Region abbrev → ISO country. US abbrevs win collisions (same as HMC). */');
lines.push('const REGION_TO_COUNTRY: Record<string, string> = {');
for (const [code] of US_STATES) lines.push(`  ${JSON.stringify(code)}: 'US',`);
for (const [abbrev, row] of Object.entries(data)) {
  if (usCodes.has(abbrev)) continue;
  lines.push(`  ${JSON.stringify(abbrev)}: ${JSON.stringify(row.cc)},`);
}
lines.push('};');
lines.push('');
lines.push('export const HMC_REGIONS_BY_COUNTRY: Readonly<Record<string, ReadonlyArray<HmcRegionOption>>> = {');
for (const cc of order) {
  lines.push(`  ${JSON.stringify(cc)}: [`);
  for (const r of byCc[cc] || []) {
    lines.push(`    { code: ${JSON.stringify(r.code)}, label: ${JSON.stringify(r.label)} },`);
  }
  lines.push('  ],');
}
lines.push('};');
lines.push('');
lines.push('export function getHmcCountry(code: string | null | undefined): HmcCountryConfig | undefined {');
lines.push("  const k = (code ?? '').trim().toUpperCase();");
lines.push('  return HMC_COUNTRIES.find((c) => c.code === k);');
lines.push('}');
lines.push('');
lines.push('export function getHmcRegionsForCountry(countryCode: string | null | undefined): ReadonlyArray<HmcRegionOption> {');
lines.push("  const k = (countryCode ?? '').trim().toUpperCase();");
lines.push('  return HMC_REGIONS_BY_COUNTRY[k] ?? [];');
lines.push('}');
lines.push('');
lines.push('/** Resolve region abbrev → ISO country (US wins collisions). */');
lines.push('export function hmcCountryForRegion(regionAbbrev: string | null | undefined): string | null {');
lines.push("  const k = (regionAbbrev ?? '').trim().toUpperCase();");
lines.push('  return REGION_TO_COUNTRY[k] ?? null;');
lines.push('}');
lines.push('');
lines.push('/** Normalize HMC region abbrev if known, else null. */');
lines.push('export function normalizeHmcRegionCode(region: string | null | undefined): string | null {');
lines.push("  const k = (region ?? '').trim().toUpperCase();");
lines.push('  if (!k || !REGION_TO_COUNTRY[k]) return null;');
lines.push('  return k;');
lines.push('}');
lines.push('');
lines.push('export function isHmcDirectoryCountry(code: string | null | undefined): boolean {');
lines.push('  return getHmcCountry(code) != null;');
lines.push('}');
lines.push('');
lines.push('/** True when value is an HMC ISO code or an exact directory country name. */');
lines.push('export function matchesHmcDirectoryCountry(value: string | null | undefined): boolean {');
lines.push("  const raw = (value ?? '').trim();");
lines.push('  if (!raw) return false;');
lines.push('  if (getHmcCountry(raw)) return true;');
lines.push('  const lower = raw.toLowerCase();');
lines.push('  return HMC_COUNTRIES.some((c) => c.name.toLowerCase() === lower);');
lines.push('}');
lines.push('');
lines.push('/**');
lines.push(' * Map Nominatim / free-text place hints to an HMC region abbrev within a country.');
lines.push(' * Prefers ISO3166-2 (`US-TX`, `CA-ON`), then state_code, then region display name.');
lines.push(' */');
lines.push('export function matchHmcRegionInCountry(');
lines.push('  countryCode: string | null | undefined,');
lines.push('  hints: {');
lines.push('    iso3166?: string | null;');
lines.push('    stateCode?: string | null;');
lines.push('    stateName?: string | null;');
lines.push('  },');
lines.push('): string | null {');
lines.push("  const cc = (countryCode ?? '').trim().toUpperCase();");
lines.push('  if (!cc || !HMC_COUNTRY_CODES.has(cc)) return null;');
lines.push('  const regions = getHmcRegionsForCountry(cc);');
lines.push('');
lines.push("  const iso = (hints.iso3166 ?? '').trim().toUpperCase();");
lines.push('  if (iso) {');
lines.push('    const parts = iso.split(\'-\');');
lines.push('    if (parts.length >= 2) {');
lines.push('      const isoCc = parts[0]!;');
lines.push("      const isoRegion = parts.slice(1).join('-');");
lines.push('      if (isoCc === cc) {');
lines.push('        const byCode = normalizeHmcRegionCode(isoRegion);');
lines.push('        if (byCode && hmcCountryForRegion(byCode) === cc) return byCode;');
lines.push('        const direct = regions.find((r) => r.code === isoRegion);');
lines.push('        if (direct) return direct.code;');
lines.push('      }');
lines.push('    }');
lines.push('  }');
lines.push('');
lines.push("  const stateCode = (hints.stateCode ?? '').trim().toUpperCase();");
lines.push('  if (stateCode) {');
lines.push('    const byCode = normalizeHmcRegionCode(stateCode);');
lines.push('    if (byCode && hmcCountryForRegion(byCode) === cc) return byCode;');
lines.push('    const inCountry = regions.find((r) => r.code === stateCode);');
lines.push('    if (inCountry) return inCountry.code;');
lines.push('  }');
lines.push('');
lines.push("  const stateName = (hints.stateName ?? '').trim().toLowerCase();");
lines.push('  if (stateName) {');
lines.push('    const exact = regions.find((r) => r.label.toLowerCase() === stateName);');
lines.push('    if (exact) return exact.code;');
lines.push('    const starts = regions.find(');
lines.push('      (r) => stateName.startsWith(r.label.toLowerCase()) || r.label.toLowerCase().startsWith(stateName),');
lines.push('    );');
lines.push('    if (starts) return starts.code;');
lines.push('  }');
lines.push('');
lines.push('  return null;');
lines.push('}');
lines.push('');

const out = path.join(root, 'src/utils/hmc-directory.ts');
fs.writeFileSync(out, lines.join('\n'));
console.log(`Wrote ${out} (${order.length} countries, ${Object.keys(data).length + US_STATES.length} region keys)`);
