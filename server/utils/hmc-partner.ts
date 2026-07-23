/**
 * Here’s My Church partner API client (server-only).
 * Never expose HERESMYCHURCH_PARTNER_API_KEY to the browser.
 *
 * @see heresmychurch/docs/future/public-api.md
 */

export type HmcLeanChurch = {
  id: string;
  shortId: string;
  name: string;
  city: string;
  state: string;
  address?: string | null;
  denomination?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export class HmcPartnerError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 502,
  ) {
    super(message);
    this.name = 'HmcPartnerError';
  }
}

type HmcConfig = {
  baseUrl: string;
  anonKey: string;
  partnerKey: string;
};

function readHmcConfig(): HmcConfig {
  const baseUrl = (process.env.HERESMYCHURCH_API_BASE ?? '').trim().replace(/\/$/, '');
  const anonKey = (process.env.HERESMYCHURCH_ANON_KEY ?? '').trim();
  const partnerKey = (process.env.HERESMYCHURCH_PARTNER_API_KEY ?? '').trim();
  if (!baseUrl || !anonKey || !partnerKey) {
    throw new HmcPartnerError(
      'Here’s My Church partner API is not configured',
      'HMC_NOT_CONFIGURED',
      503,
    );
  }
  return { baseUrl, anonKey, partnerKey };
}

function partnerHeaders(config: HmcConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.anonKey}`,
    apikey: config.anonKey,
    'x-partner-key': config.partnerKey,
    Accept: 'application/json',
  };
}

function normalizeLeanChurch(raw: unknown): HmcLeanChurch | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!id || !name) return null;
  return {
    id,
    shortId: typeof row.shortId === 'string' ? row.shortId : '',
    name,
    city: typeof row.city === 'string' ? row.city : '',
    state: typeof row.state === 'string' ? row.state : '',
    address: typeof row.address === 'string' ? row.address : null,
    denomination: typeof row.denomination === 'string' ? row.denomination : null,
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null,
  };
}

async function hmcFetchJson<T>(pathWithQuery: string, init?: RequestInit): Promise<T> {
  const config = readHmcConfig();
  const url = `${config.baseUrl}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...partnerHeaders(config),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new HmcPartnerError(
      error instanceof Error ? error.message : 'Here’s My Church request failed',
      'HMC_NETWORK_ERROR',
      502,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new HmcPartnerError('Here’s My Church partner auth failed', 'HMC_UNAUTHORIZED', 502);
  }
  if (response.status === 429) {
    throw new HmcPartnerError('Here’s My Church rate limit exceeded', 'HMC_RATE_LIMITED', 429);
  }
  if (response.status === 503) {
    throw new HmcPartnerError('Here’s My Church partner API not configured upstream', 'HMC_UPSTREAM_NOT_CONFIGURED', 503);
  }

  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new HmcPartnerError(
      typeof body.error === 'string' ? body.error : `Here’s My Church error (${response.status})`,
      'HMC_UPSTREAM_ERROR',
      response.status >= 400 && response.status < 600 ? response.status : 502,
    );
  }
  return body;
}

export function isHmcConfigured(): boolean {
  try {
    readHmcConfig();
    return true;
  } catch {
    return false;
  }
}

export async function hmcSearchChurches(options: {
  q: string;
  state: string;
  limit?: number;
}): Promise<HmcLeanChurch[]> {
  const q = options.q.trim();
  const state = options.state.trim().toUpperCase();
  if (q.length < 2) return [];
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new HmcPartnerError('state must be a 2-letter US abbreviation', 'HMC_INVALID_STATE', 400);
  }
  const limit = Math.min(50, Math.max(1, Math.round(options.limit ?? 20)));
  const params = new URLSearchParams({
    q,
    state,
    limit: String(limit),
  });
  const data = await hmcFetchJson<{ results?: unknown[] }>(`/churches/search?${params.toString()}`);
  return (data.results ?? []).map(normalizeLeanChurch).filter((row): row is HmcLeanChurch => row != null);
}

export async function hmcGetChurchById(id: string): Promise<HmcLeanChurch | null> {
  const churchId = id.trim();
  if (!churchId) {
    throw new HmcPartnerError('hmcChurchId is required', 'HMC_INVALID_ID', 400);
  }
  const encoded = encodeURIComponent(churchId);
  try {
    const data = await hmcFetchJson<{ church?: unknown; error?: string }>(`/churches/by-id/${encoded}`);
    return normalizeLeanChurch(data.church);
  } catch (error) {
    if (error instanceof HmcPartnerError && error.status === 404) return null;
    throw error;
  }
}

/** Denormalized cache fields for Harvous Churches / UserMetadata. */
export function hmcDenormFields(church: HmcLeanChurch): {
  name: string;
  city: string | null;
  state: string | null;
} {
  return {
    name: church.name,
    city: church.city?.trim() || null,
    state: church.state?.trim() || null,
  };
}
