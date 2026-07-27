import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HmcPartnerError,
  hmcAddChurch,
  hmcDenormFields,
  hmcGetChurchById,
  hmcSearchChurches,
  hmcSubmitUnlistedUsChurch,
  isHmcConfigured,
} from '../hmc-partner';

const originalFetch = globalThis.fetch;
const envKeys = [
  'HERESMYCHURCH_API_BASE',
  'HERESMYCHURCH_ANON_KEY',
  'HERESMYCHURCH_PARTNER_API_KEY',
] as const;

function setEnv() {
  process.env.HERESMYCHURCH_API_BASE =
    'https://example.supabase.co/functions/v1/make-server-283d8046/v1';
  process.env.HERESMYCHURCH_ANON_KEY = 'anon-test';
  process.env.HERESMYCHURCH_PARTNER_API_KEY = 'partner-test';
}

function clearEnv() {
  for (const key of envKeys) delete process.env[key];
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearEnv();
  vi.restoreAllMocks();
});

describe('isHmcConfigured', () => {
  it('is false when env is missing', () => {
    clearEnv();
    expect(isHmcConfigured()).toBe(false);
  });

  it('is true when all env vars are set', () => {
    setEnv();
    expect(isHmcConfigured()).toBe(true);
  });
});

describe('hmcSearchChurches', () => {
  it('throws HMC_NOT_CONFIGURED without env', async () => {
    clearEnv();
    await expect(hmcSearchChurches({ q: 'Grace', state: 'TX' })).rejects.toMatchObject({
      code: 'HMC_NOT_CONFIGURED',
    });
  });

  it('returns [] for short queries without calling fetch', async () => {
    setEnv();
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(hmcSearchChurches({ q: 'G', state: 'TX' })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps search results and sends partner headers', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async (input, init) => {
      expect(String(input)).toContain('/churches/search?');
      expect(String(input)).toContain('q=Grace');
      expect(String(input)).toContain('state=TX');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-partner-key')).toBe('partner-test');
      expect(headers.get('apikey')).toBe('anon-test');
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 'TX-123',
              shortId: '00000123',
              name: 'Grace Community',
              city: 'Austin',
              state: 'TX',
            },
          ],
          query: 'Grace',
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const rows = await hmcSearchChurches({ q: 'Grace', state: 'tx', limit: 10 });
    expect(rows).toEqual([
      {
        id: 'TX-123',
        shortId: '00000123',
        name: 'Grace Community',
        city: 'Austin',
        state: 'TX',
        address: null,
        denomination: null,
        lat: null,
        lng: null,
      },
    ]);
  });

  it('accepts longer international region abbrevs', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toContain('state=AUNSW');
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(hmcSearchChurches({ q: 'Grace', state: 'AUNSW' })).resolves.toEqual([]);
  });
});

describe('hmcGetChurchById', () => {
  it('returns lean church from by-id envelope', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          church: {
            id: 'TX-99',
            shortId: '00000099',
            name: 'Testament Made',
            city: 'Dallas',
            state: 'TX',
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await expect(hmcGetChurchById('TX-99')).resolves.toMatchObject({
      id: 'TX-99',
      name: 'Testament Made',
      city: 'Dallas',
      state: 'TX',
    });
  });

  it('returns null on 404', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ church: null, error: 'not found' }), { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(hmcGetChurchById('TX-missing')).resolves.toBeNull();
  });
});

describe('hmcDenormFields', () => {
  it('trims empty city/state to null and derives country', () => {
    expect(
      hmcDenormFields({
        id: 'TX-1',
        shortId: '1',
        name: 'Hope',
        city: '  ',
        state: 'TX',
      }),
    ).toEqual({ name: 'Hope', city: null, state: 'TX', country: 'US' });
  });

  it('derives non-US country from region abbrev', () => {
    expect(
      hmcDenormFields({
        id: 'CA-PE-1',
        shortId: '1',
        name: 'Grace',
        city: 'Charlottetown',
        state: 'PE',
      }),
    ).toEqual({
      name: 'Grace',
      city: 'Charlottetown',
      state: 'PE',
      country: 'CA',
    });
  });
});

describe('HmcPartnerError', () => {
  it('carries code/status', () => {
    const err = new HmcPartnerError('nope', 'HMC_NOT_CONFIGURED', 503);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('HMC_NOT_CONFIGURED');
    expect(err.status).toBe(503);
  });
});

describe('hmcAddChurch', () => {
  it('posts to edge root /churches/add (not partner /v1)', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async (input, init) => {
      expect(String(input)).toBe(
        'https://example.supabase.co/functions/v1/make-server-283d8046/churches/add',
      );
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-partner-key')).toBe('partner-test');
      return new Response(
        JSON.stringify({
          success: true,
          church: {
            id: 'community-IA-1',
            shortId: '1',
            name: 'New Hope',
            city: 'Des Moines',
            state: 'IA',
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await expect(
      hmcAddChurch({
        name: 'New Hope',
        city: 'Des Moines',
        state: 'IA',
        lat: 41.5,
        lng: -93.6,
      }),
    ).resolves.toMatchObject({
      isDuplicate: false,
      church: { id: 'community-IA-1', name: 'New Hope', state: 'IA' },
    });
  });

  it('maps existingChurch duplicates', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          isDuplicate: true,
          existingChurch: {
            id: 'IA-99',
            shortId: '99',
            name: 'Grace',
            city: 'Ames',
            state: 'IA',
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    await expect(
      hmcAddChurch({
        name: 'Grace',
        city: 'Ames',
        state: 'IA',
        lat: 42,
        lng: -93,
      }),
    ).resolves.toMatchObject({
      isDuplicate: true,
      church: { id: 'IA-99' },
    });
  });

  it('binds best similar match when HMC returns needsConfirmation', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { confirmAdd?: boolean };
      expect(body.confirmAdd).toBeUndefined();
      return new Response(
        JSON.stringify({
          needsConfirmation: true,
          similar: [
            {
              id: 'IA-42',
              shortId: '00000042',
              name: 'Grace Fellowship',
              city: 'Ames',
              state: 'IA',
              address: '100 Main',
            },
            {
              id: 'IA-43',
              shortId: '00000043',
              name: 'Grace Other',
              city: 'Ames',
              state: 'IA',
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await expect(
      hmcAddChurch({
        name: 'Grace Fellowship Church',
        city: 'Ames',
        state: 'IA',
        lat: 42,
        lng: -93,
      }),
    ).resolves.toMatchObject({
      isDuplicate: true,
      church: {
        id: 'IA-42',
        name: 'Grace Fellowship',
        city: 'Ames',
        state: 'IA',
        address: '100 Main',
      },
    });
  });

  it('sends confirmAdd when requested', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { confirmAdd?: boolean };
      expect(body.confirmAdd).toBe(true);
      return new Response(
        JSON.stringify({
          success: true,
          church: {
            id: 'community-IA-2',
            shortId: '2',
            name: 'Brand New',
            city: 'Ames',
            state: 'IA',
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await expect(
      hmcAddChurch({
        name: 'Brand New',
        city: 'Ames',
        state: 'IA',
        lat: 42,
        lng: -93,
        confirmAdd: true,
      }),
    ).resolves.toMatchObject({
      isDuplicate: false,
      church: { id: 'community-IA-2' },
    });
  });
});

describe('hmcSubmitUnlistedUsChurch', () => {
  it('returns null church when geocode finds nothing', async () => {
    setEnv();
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input).includes('nominatim')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as unknown as typeof fetch;

    await expect(
      hmcSubmitUnlistedUsChurch({ name: 'Hope', city: 'Nowhere', state: 'IA' }),
    ).resolves.toBeNull();
  });
});

describe('matchHmcRegionInCountry via address geocode path', () => {
  it('accepts freeform address and maps Nominatim ISO to region', async () => {
    const { hmcSubmitUnlistedChurch } = await import('../hmc-partner');
    setEnv();
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input).includes('nominatim')) {
        return new Response(
          JSON.stringify([
            {
              lat: '41.59',
              lon: '-93.62',
              address: {
                house_number: '100',
                road: 'Main St',
                city: 'Des Moines',
                state: 'Iowa',
                state_code: 'IA',
                'ISO3166-2-lvl4': 'US-IA',
                country_code: 'us',
              },
            },
          ]),
          { status: 200 },
        );
      }
      if (String(input).includes('/churches/add')) {
        return new Response(
          JSON.stringify({
            success: true,
            church: {
              id: 'community-IA-9',
              shortId: '9',
              name: 'New Hope',
              city: 'Des Moines',
              state: 'IA',
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as unknown as typeof fetch;

    await expect(
      hmcSubmitUnlistedChurch({
        name: 'New Hope',
        country: 'US',
        address: '100 Main St, Des Moines, IA',
      }),
    ).resolves.toMatchObject({
      church: { id: 'community-IA-9', state: 'IA' },
      place: { city: 'Des Moines', state: 'IA', country: 'US' },
    });
  });
});
