/** US state / DC abbreviations for Here’s My Church state-scoped search. */
export const US_STATE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'AL', label: 'Alabama' },
  { code: 'AK', label: 'Alaska' },
  { code: 'AZ', label: 'Arizona' },
  { code: 'AR', label: 'Arkansas' },
  { code: 'CA', label: 'California' },
  { code: 'CO', label: 'Colorado' },
  { code: 'CT', label: 'Connecticut' },
  { code: 'DE', label: 'Delaware' },
  { code: 'DC', label: 'District of Columbia' },
  { code: 'FL', label: 'Florida' },
  { code: 'GA', label: 'Georgia' },
  { code: 'HI', label: 'Hawaii' },
  { code: 'ID', label: 'Idaho' },
  { code: 'IL', label: 'Illinois' },
  { code: 'IN', label: 'Indiana' },
  { code: 'IA', label: 'Iowa' },
  { code: 'KS', label: 'Kansas' },
  { code: 'KY', label: 'Kentucky' },
  { code: 'LA', label: 'Louisiana' },
  { code: 'ME', label: 'Maine' },
  { code: 'MD', label: 'Maryland' },
  { code: 'MA', label: 'Massachusetts' },
  { code: 'MI', label: 'Michigan' },
  { code: 'MN', label: 'Minnesota' },
  { code: 'MS', label: 'Mississippi' },
  { code: 'MO', label: 'Missouri' },
  { code: 'MT', label: 'Montana' },
  { code: 'NE', label: 'Nebraska' },
  { code: 'NV', label: 'Nevada' },
  { code: 'NH', label: 'New Hampshire' },
  { code: 'NJ', label: 'New Jersey' },
  { code: 'NM', label: 'New Mexico' },
  { code: 'NY', label: 'New York' },
  { code: 'NC', label: 'North Carolina' },
  { code: 'ND', label: 'North Dakota' },
  { code: 'OH', label: 'Ohio' },
  { code: 'OK', label: 'Oklahoma' },
  { code: 'OR', label: 'Oregon' },
  { code: 'PA', label: 'Pennsylvania' },
  { code: 'RI', label: 'Rhode Island' },
  { code: 'SC', label: 'South Carolina' },
  { code: 'SD', label: 'South Dakota' },
  { code: 'TN', label: 'Tennessee' },
  { code: 'TX', label: 'Texas' },
  { code: 'UT', label: 'Utah' },
  { code: 'VT', label: 'Vermont' },
  { code: 'VA', label: 'Virginia' },
  { code: 'WA', label: 'Washington' },
  { code: 'WV', label: 'West Virginia' },
  { code: 'WI', label: 'Wisconsin' },
  { code: 'WY', label: 'Wyoming' },
];

export const US_STATE_CODES: ReadonlySet<string> = new Set(US_STATE_OPTIONS.map((o) => o.code));

/** Normalize to a 2-letter US/DC code, or null. */
export function normalizeUsStateCode(state: string | null | undefined): string | null {
  const code = (state ?? '').trim().toUpperCase();
  return US_STATE_CODES.has(code) ? code : null;
}

export function isUnitedStatesCountryLabel(country: string | null | undefined): boolean {
  const n = (country ?? '').trim().toLowerCase();
  if (!n) return false;
  return (
    n === 'us' ||
    n === 'usa' ||
    n === 'u.s.' ||
    n === 'u.s.a.' ||
    n === 'united states' ||
    n === 'united states of america'
  );
}

/**
 * Manual My Church entry counts as U.S. (and should also submit to HMC) when
 * state is a US code and country is empty or explicitly United States.
 */
export function isUsChurchLocation(options: {
  churchState?: string | null;
  churchCountry?: string | null;
}): boolean {
  const state = normalizeUsStateCode(options.churchState);
  if (!state) return false;
  const country = (options.churchCountry ?? '').trim();
  if (!country) return true;
  return isUnitedStatesCountryLabel(country);
}
