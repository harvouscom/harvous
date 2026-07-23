import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HmcPartnerError,
  hmcDenormFields,
  hmcGetChurchById,
  hmcSearchChurches,
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
  it('trims empty city/state to null', () => {
    expect(
      hmcDenormFields({
        id: 'TX-1',
        shortId: '1',
        name: 'Hope',
        city: '  ',
        state: 'TX',
      }),
    ).toEqual({ name: 'Hope', city: null, state: 'TX' });
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
