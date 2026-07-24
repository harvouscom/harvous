/**
 * Here’s My Church partner API client (server-only).
 * Never expose HERESMYCHURCH_PARTNER_API_KEY to the browser.
 *
 * Partner reads use `HERESMYCHURCH_API_BASE` (…/v1). Community writes
 * (`POST /churches/add`) live on the edge function root (strip trailing `/v1`).
 *
 * @see heresmychurch/docs/future/public-api.md
 */

import { normalizeUsStateCode } from '@/utils/us-states';

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

export type HmcAddChurchResult = {
  church: HmcLeanChurch;
  isDuplicate: boolean;
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

/** Edge function root (partner base without trailing `/v1`) for community write routes. */
function readHmcEdgeRoot(): string {
  const { baseUrl } = readHmcConfig();
  return baseUrl.replace(/\/v1$/i, '');
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

/**
 * Geocode a US city (+ optional street) via Nominatim for HMC add.
 * City + state is enough for a pin; street improves accuracy when present.
 */
export async function hmcGeocodeUsPlace(options: {
  city: string;
  state: string;
  address?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const city = options.city.trim();
  const state = normalizeUsStateCode(options.state);
  const street = (options.address ?? '').trim();
  if (!city || !state) return null;
  const q = street ? `${street}, ${city}, ${state}, USA` : `${city}, ${state}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
    countrycodes: 'us',
  })}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Harvous/1.0 (Bible study notes; https://harvous.com)',
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(data) ? data[0] : null;
    if (!first?.lat || !first?.lon) return null;
    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < 18 || lat > 72 || lng < -180 || lng > -65) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Submit a missing U.S. church to Here’s My Church (community add).
 * Uses the edge-function write route (not partner `/v1`).
 */
export async function hmcAddChurch(options: {
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  address?: string | null;
}): Promise<HmcAddChurchResult> {
  const name = options.name.trim();
  const city = options.city.trim();
  const state = normalizeUsStateCode(options.state);
  if (!name || name.length < 2) {
    throw new HmcPartnerError('Church name is required', 'HMC_INVALID_NAME', 400);
  }
  if (!city) {
    throw new HmcPartnerError('City is required to add a U.S. church', 'HMC_INVALID_CITY', 400);
  }
  if (!state) {
    throw new HmcPartnerError('state must be a 2-letter US abbreviation', 'HMC_INVALID_STATE', 400);
  }
  if (!Number.isFinite(options.lat) || !Number.isFinite(options.lng)) {
    throw new HmcPartnerError('Valid US coordinates are required', 'HMC_INVALID_COORDS', 400);
  }

  const config = readHmcConfig();
  const edgeRoot = readHmcEdgeRoot();
  const url = `${edgeRoot}/churches/add`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        ...partnerHeaders(config),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        city,
        state,
        lat: options.lat,
        lng: options.lng,
        address: (options.address ?? '').trim(),
      }),
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

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    success?: boolean;
    isDuplicate?: boolean;
    church?: unknown;
    existingChurch?: unknown;
  };
  if (!response.ok) {
    throw new HmcPartnerError(
      typeof body.error === 'string' ? body.error : `Here’s My Church error (${response.status})`,
      'HMC_UPSTREAM_ERROR',
      response.status >= 400 && response.status < 600 ? response.status : 502,
    );
  }

  const fromChurch = normalizeLeanChurch(body.church);
  if (fromChurch) {
    return { church: fromChurch, isDuplicate: Boolean(body.isDuplicate) };
  }
  const existing = normalizeLeanChurch(body.existingChurch);
  if (existing) {
    return { church: existing, isDuplicate: true };
  }
  throw new HmcPartnerError('Here’s My Church add returned no church', 'HMC_UPSTREAM_ERROR', 502);
}

/**
 * Best-effort: geocode + submit a U.S. church that wasn’t in the directory.
 * Returns the HMC lean row when submission (or duplicate match) succeeds; otherwise null.
 */
export async function hmcSubmitUnlistedUsChurch(options: {
  name: string;
  city: string;
  state: string;
  address?: string | null;
}): Promise<HmcLeanChurch | null> {
  if (!isHmcConfigured()) return null;
  const coords = await hmcGeocodeUsPlace({
    city: options.city,
    state: options.state,
    address: options.address,
  });
  if (!coords) return null;
  try {
    const result = await hmcAddChurch({
      name: options.name,
      city: options.city,
      state: options.state,
      address: options.address,
      lat: coords.lat,
      lng: coords.lng,
    });
    return result.church;
  } catch (error) {
    if (error instanceof HmcPartnerError && error.code === 'HMC_RATE_LIMITED') throw error;
    console.warn('[hmcSubmitUnlistedUsChurch]', error instanceof Error ? error.message : error);
    return null;
  }
}
