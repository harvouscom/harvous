/**
 * Default country for the My Church / HMC picker.
 *
 * Cascade: preferred → last-used → device locale → timezone → US.
 * Native equivalent: Locale.current.region → UserDefaults last-used → US (no Core Location / IP).
 */

import { isHmcDirectoryCountry } from '@/utils/hmc-directory';

export const HMC_PICKER_COUNTRY_KEY = 'harvous-hmc-picker-country';

/** Fallback when no signal maps to a directory country. */
export const HMC_DEFAULT_COUNTRY_FALLBACK = 'US';

/**
 * Common IANA zones → HMC ISO codes. Soft fallback when locale has no region
 * (e.g. bare `en`). Prefer locale; do not treat this as geo truth.
 */
const TIMEZONE_TO_HMC_COUNTRY: Readonly<Record<string, string>> = {
  // United States
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Anchorage': 'US',
  'America/Honolulu': 'US',
  'America/Boise': 'US',
  'America/Detroit': 'US',
  'America/Indiana/Indianapolis': 'US',
  'America/Kentucky/Louisville': 'US',
  'America/Puerto_Rico': 'US',
  'Pacific/Honolulu': 'US',
  // Canada
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'America/St_Johns': 'CA',
  'America/Regina': 'CA',
  'America/Whitehorse': 'CA',
  // UK / Ireland
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  // EU directory
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT',
  'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL',
  // Australia (also matched by prefix below)
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU',
  'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU',
};

export type HmcCountryDeviceHints = {
  /** BCP-47 tags, e.g. from `navigator.languages`. */
  languages?: readonly string[];
  /** IANA timezone, e.g. from `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  timeZone?: string | null;
};

function asDirectoryCountry(code: string | null | undefined): string | null {
  const k = (code ?? '').trim().toUpperCase();
  if (!k || !isHmcDirectoryCountry(k)) return null;
  return k;
}

/** Locale region via Intl.Locale (+ maximize when region is missing). */
export function guessHmcCountryFromLanguages(
  languages: readonly string[] | null | undefined,
): string | null {
  for (const tag of languages ?? []) {
    if (!tag || typeof tag !== 'string') continue;
    try {
      const locale = new Intl.Locale(tag);
      const maximized =
        typeof locale.maximize === 'function' ? locale.maximize() : locale;
      const region = maximized.region ?? locale.region;
      const hit = asDirectoryCountry(region);
      if (hit) return hit;
    } catch {
      /* ignore invalid tags */
    }
  }
  return null;
}

export function guessHmcCountryFromTimeZone(timeZone: string | null | undefined): string | null {
  const tz = (timeZone ?? '').trim();
  if (!tz) return null;
  const exact = asDirectoryCountry(TIMEZONE_TO_HMC_COUNTRY[tz]);
  if (exact) return exact;
  if (tz.startsWith('Australia/')) return 'AU';
  return null;
}

/**
 * Device guess: locale region, then timezone. Returns null when neither maps
 * to an HMC directory country.
 */
export function guessHmcDirectoryCountryFromDevice(
  hints?: HmcCountryDeviceHints,
): string | null {
  const languages =
    hints?.languages ??
    (typeof navigator !== 'undefined'
      ? navigator.languages?.length
        ? navigator.languages
        : navigator.language
          ? [navigator.language]
          : []
      : []);
  const fromLocale = guessHmcCountryFromLanguages(languages);
  if (fromLocale) return fromLocale;

  const timeZone =
    hints?.timeZone !== undefined
      ? hints.timeZone
      : typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null;
  return guessHmcCountryFromTimeZone(timeZone);
}

export function getLastHmcPickerCountry(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
): string | null {
  if (!storage) return null;
  try {
    return asDirectoryCountry(storage.getItem(HMC_PICKER_COUNTRY_KEY));
  } catch {
    return null;
  }
}

export function setLastHmcPickerCountry(
  code: string | null | undefined,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  if (!storage) return;
  const hit = asDirectoryCountry(code);
  try {
    if (!hit) {
      storage.removeItem(HMC_PICKER_COUNTRY_KEY);
      return;
    }
    storage.setItem(HMC_PICKER_COUNTRY_KEY, hit);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Resolve starting country for the HMC picker.
 * Preferred (caller) → last-used → device locale/timezone → US.
 */
export function resolveDefaultHmcCountry(
  preferred?: string | null,
  options?: {
    storage?: Pick<Storage, 'getItem'> | null;
    device?: HmcCountryDeviceHints;
  },
): string {
  const fromPreferred = asDirectoryCountry(preferred);
  if (fromPreferred) return fromPreferred;

  const storage =
    options?.storage !== undefined
      ? options.storage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : null;
  const fromLast = getLastHmcPickerCountry(storage);
  if (fromLast) return fromLast;

  const fromDevice = guessHmcDirectoryCountryFromDevice(options?.device);
  if (fromDevice) return fromDevice;

  return HMC_DEFAULT_COUNTRY_FALLBACK;
}
