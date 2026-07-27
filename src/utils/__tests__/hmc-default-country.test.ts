import { afterEach, describe, expect, it } from 'vitest';
import {
  HMC_DEFAULT_COUNTRY_FALLBACK,
  HMC_PICKER_COUNTRY_KEY,
  getLastHmcPickerCountry,
  guessHmcCountryFromLanguages,
  guessHmcCountryFromTimeZone,
  guessHmcDirectoryCountryFromDevice,
  resolveDefaultHmcCountry,
  setLastHmcPickerCountry,
} from '../hmc-default-country';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key() {
      return null;
    },
  };
}

afterEach(() => {
  try {
    localStorage.removeItem(HMC_PICKER_COUNTRY_KEY);
  } catch {
    /* ignore */
  }
});

describe('guessHmcCountryFromLanguages', () => {
  it('reads region from BCP-47 tags', () => {
    expect(guessHmcCountryFromLanguages(['en-CA'])).toBe('CA');
    expect(guessHmcCountryFromLanguages(['fr-FR'])).toBe('FR');
    expect(guessHmcCountryFromLanguages(['en-AU', 'en'])).toBe('AU');
  });

  it('ignores non-directory regions', () => {
    expect(guessHmcCountryFromLanguages(['es-MX'])).toBeNull();
    expect(guessHmcCountryFromLanguages(['ja-JP'])).toBeNull();
  });

  it('maximizes bare language tags when possible', () => {
    // Node/Intl typically maximize `en` → en-US
    const hit = guessHmcCountryFromLanguages(['en']);
    expect(hit === 'US' || hit === null).toBe(true);
  });
});

describe('guessHmcCountryFromTimeZone', () => {
  it('maps known IANA zones', () => {
    expect(guessHmcCountryFromTimeZone('America/Toronto')).toBe('CA');
    expect(guessHmcCountryFromTimeZone('Europe/London')).toBe('GB');
    expect(guessHmcCountryFromTimeZone('America/Chicago')).toBe('US');
  });

  it('maps Australia/* by prefix', () => {
    expect(guessHmcCountryFromTimeZone('Australia/Sydney')).toBe('AU');
    expect(guessHmcCountryFromTimeZone('Australia/Eucla')).toBe('AU');
  });

  it('returns null for unknown zones', () => {
    expect(guessHmcCountryFromTimeZone('Asia/Tokyo')).toBeNull();
    expect(guessHmcCountryFromTimeZone('America/Mexico_City')).toBeNull();
  });
});

describe('guessHmcDirectoryCountryFromDevice', () => {
  it('prefers locale over timezone', () => {
    expect(
      guessHmcDirectoryCountryFromDevice({
        languages: ['en-CA'],
        timeZone: 'America/Chicago',
      }),
    ).toBe('CA');
  });

  it('falls back to timezone when locale has no directory region', () => {
    expect(
      guessHmcDirectoryCountryFromDevice({
        languages: ['es-MX'],
        timeZone: 'Europe/Dublin',
      }),
    ).toBe('IE');
  });
});

describe('last-used picker country', () => {
  it('stores and reads directory countries only', () => {
    const storage = memoryStorage();
    setLastHmcPickerCountry('gb', storage);
    expect(getLastHmcPickerCountry(storage)).toBe('GB');
    setLastHmcPickerCountry('MX', storage);
    expect(getLastHmcPickerCountry(storage)).toBeNull();
  });
});

describe('resolveDefaultHmcCountry', () => {
  it('uses preferred when in directory', () => {
    expect(
      resolveDefaultHmcCountry('de', {
        storage: memoryStorage({ [HMC_PICKER_COUNTRY_KEY]: 'CA' }),
        device: { languages: ['en-US'], timeZone: 'America/Toronto' },
      }),
    ).toBe('DE');
  });

  it('uses last-used before device guess', () => {
    expect(
      resolveDefaultHmcCountry(null, {
        storage: memoryStorage({ [HMC_PICKER_COUNTRY_KEY]: 'NL' }),
        device: { languages: ['en-CA'], timeZone: 'America/Toronto' },
      }),
    ).toBe('NL');
  });

  it('uses device guess then fallback US', () => {
    expect(
      resolveDefaultHmcCountry(undefined, {
        storage: memoryStorage(),
        device: { languages: ['en-IE'], timeZone: 'Europe/Dublin' },
      }),
    ).toBe('IE');

    expect(
      resolveDefaultHmcCountry(undefined, {
        storage: memoryStorage(),
        device: { languages: ['ja-JP'], timeZone: 'Asia/Tokyo' },
      }),
    ).toBe(HMC_DEFAULT_COUNTRY_FALLBACK);
  });
});
