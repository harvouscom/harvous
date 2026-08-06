/**
 * A church's ISO country, derived when nobody supplied one.
 *
 * `Churches.country` is nullable and was empty on every existing row, including
 * HMC-linked ones whose `state` made the answer obvious — 'IA' is 'US'. That
 * left the settings time-zone picker unable to shortlist, since it has nothing
 * to match a country against.
 *
 * `hmcCountryForRegion` is the same mapper `hmcDenormFields` already uses, so
 * a derived country agrees with a linked one by construction rather than by a
 * second table that could disagree.
 */
import { hmcCountryForRegion } from '@/utils/hmc-directory';

/**
 * The country to store, given whatever was supplied.
 *
 * An explicit country always wins — including one this mapper wouldn't produce,
 * because a church outside HMC's region coverage must still be able to say
 * where it is. Only a *missing* country is derived, and only from a region the
 * mapper actually knows; an unrecognised state yields null rather than a guess.
 */
export function deriveChurchCountry(
  country: string | null | undefined,
  state: string | null | undefined,
): string | null {
  const explicit = String(country ?? '').trim();
  if (explicit) {
    // Two-letter codes are normalized so 'us' and 'US' can't both be stored;
    // anything longer is a name we pass through untouched.
    return /^[A-Za-z]{2}$/.test(explicit) ? explicit.toUpperCase() : explicit;
  }
  return hmcCountryForRegion(state) ?? null;
}
