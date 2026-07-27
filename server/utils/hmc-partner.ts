/**
 * Here’s My Church partner API client (server-only).
 * Never expose HERESMYCHURCH_PARTNER_API_KEY to the browser.
 *
 * Partner reads use `HERESMYCHURCH_API_BASE` (…/v1). Community writes
 * (`POST /churches/add`) live on the edge function root (strip trailing `/v1`).
 *
 * @see heresmychurch/docs/future/public-api.md
 */

import {
  getHmcCountry,
  hmcCountryForRegion,
  matchHmcRegionInCountry,
  normalizeHmcRegionCode,
} from '@/utils/hmc-directory';
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

/** HMC region abbrev for partner search (US state or intl admin-1, e.g. ON, AUNSW). */
function normalizePartnerRegion(raw: string): string | null {
  const fromRegistry = normalizeHmcRegionCode(raw);
  if (fromRegistry) return fromRegistry;
  // Allow unknown-but-plausible abbrevs through to HMC (future regions).
  const k = raw.trim().toUpperCase();
  if (/^[A-Z][A-Z0-9]{1,31}$/.test(k)) return k;
  return null;
}

export async function hmcSearchChurches(options: {
  q: string;
  state: string;
  limit?: number;
}): Promise<HmcLeanChurch[]> {
  const q = options.q.trim();
  const state = normalizePartnerRegion(options.state);
  if (q.length < 2) return [];
  if (!state) {
    throw new HmcPartnerError(
      'state must be a Here’s My Church region abbreviation',
      'HMC_INVALID_STATE',
      400,
    );
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

/**
 * Many HMC OSM rows have street + lat/lng but an empty city. Fill city via
 * Nominatim reverse geocode so Harvous can show “City, ST”.
 */
export async function hmcFillMissingCity(church: HmcLeanChurch): Promise<HmcLeanChurch> {
  if (church.city?.trim()) return church;
  const lat = church.lat;
  const lng = church.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return church;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return church;

  const url = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    addressdetails: '1',
  })}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Harvous/1.0 (Bible study notes; https://harvous.com)',
      },
    });
    if (!response.ok) return church;
    const data = (await response.json()) as { address?: NominatimAddress };
    const city = cityFromNominatim(data.address);
    if (!city) return church;
    return { ...church, city };
  } catch {
    return church;
  }
}

/** Resolve by-id and fill missing city for denorm / profile display. */
export async function hmcGetChurchByIdForDenorm(id: string): Promise<HmcLeanChurch | null> {
  const church = await hmcGetChurchById(id);
  if (!church) return null;
  return hmcFillMissingCity(church);
}

/** Denormalized cache fields for Harvous Churches / UserMetadata. */
export function hmcDenormFields(church: HmcLeanChurch): {
  name: string;
  city: string | null;
  state: string | null;
  /** ISO 3166-1 alpha-2 from HMC region (null when unknown). */
  country: string | null;
} {
  const state = church.state?.trim() || null;
  return {
    name: church.name,
    city: church.city?.trim() || null,
    state,
    country: hmcCountryForRegion(state),
  };
}

export type HmcGeocodedPlace = {
  lat: number;
  lng: number;
  city: string;
  state: string;
  country: string;
  /** Street / house line when Nominatim provides one; else the input address. */
  address: string | null;
};

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  county?: string;
  state?: string;
  state_code?: string;
  country_code?: string;
  road?: string;
  house_number?: string;
  'ISO3166-2-lvl4'?: string;
  'ISO3166-2-lvl6'?: string;
};

function cityFromNominatim(addr: NominatimAddress | undefined): string {
  if (!addr) return '';
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.suburb ||
    addr.county ||
    ''
  ).trim();
}

function streetFromNominatim(addr: NominatimAddress | undefined): string | null {
  if (!addr) return null;
  const road = (addr.road || '').trim();
  if (!road) return null;
  const num = (addr.house_number || '').trim();
  return num ? `${num} ${road}` : road;
}

/**
 * Geocode a freeform address (street + city + region in one string) within a
 * directory country. Derives HMC region + city from Nominatim addressdetails.
 */
export async function hmcGeocodeAddress(options: {
  address: string;
  country: string;
}): Promise<HmcGeocodedPlace | null> {
  const address = options.address.trim();
  const country = options.country.trim().toUpperCase();
  if (!address || address.length < 3) return null;
  if (!getHmcCountry(country)) return null;

  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    addressdetails: '1',
    countrycodes: country.toLowerCase(),
  })}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Harvous/1.0 (Bible study notes; https://harvous.com)',
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      address?: NominatimAddress;
    }>;
    const first = Array.isArray(data) ? data[0] : null;
    if (!first?.lat || !first?.lon) return null;
    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const addr = first.address;
    const region = matchHmcRegionInCountry(country, {
      iso3166: addr?.['ISO3166-2-lvl4'] || addr?.['ISO3166-2-lvl6'],
      stateCode: addr?.state_code,
      stateName: addr?.state,
    });
    if (!region) return null;

    const city = cityFromNominatim(addr);
    if (!city) return null;

    return {
      lat,
      lng,
      city,
      state: region,
      country,
      address: streetFromNominatim(addr) || address,
    };
  } catch {
    return null;
  }
}

/**
 * Geocode a city (+ optional street) via Nominatim for HMC add.
 * City + region is enough for a pin; street improves accuracy when present.
 */
export async function hmcGeocodePlace(options: {
  city: string;
  state: string;
  country?: string | null;
  address?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  const city = options.city.trim();
  const region = normalizeHmcRegionCode(options.state) ?? normalizeUsStateCode(options.state);
  const country =
    (options.country ?? '').trim().toUpperCase() || hmcCountryForRegion(region) || 'US';
  const street = (options.address ?? '').trim();
  if (!city || !region) return null;
  const q = street
    ? `${street}, ${city}, ${region}, ${country}`
    : `${city}, ${region}, ${country}`;
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
    countrycodes: country.toLowerCase(),
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
    return { lat, lng };
  } catch {
    return null;
  }
}

/** @deprecated Use hmcGeocodePlace — kept for existing US call sites/tests. */
export async function hmcGeocodeUsPlace(options: {
  city: string;
  state: string;
  address?: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  return hmcGeocodePlace({ ...options, country: 'US' });
}

/**
 * Submit a missing church to Here’s My Church (community add).
 * Uses the edge-function write route (not partner `/v1`).
 *
 * HMC may return HTTP 200 `{ needsConfirmation: true, similar: [...] }` when
 * near-duplicates exist. Without a confirmation UI, we bind the best similar
 * match (`isDuplicate: true`) instead of force-creating with `confirmAdd`.
 */
export async function hmcAddChurch(options: {
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  address?: string | null;
  /** Force-create even when similar matches exist (HMC confirmAdd). */
  confirmAdd?: boolean;
}): Promise<HmcAddChurchResult> {
  const name = options.name.trim();
  const city = options.city.trim();
  const state = normalizeHmcRegionCode(options.state) ?? normalizeUsStateCode(options.state);
  if (!name || name.length < 2) {
    throw new HmcPartnerError('Church name is required', 'HMC_INVALID_NAME', 400);
  }
  if (!city) {
    throw new HmcPartnerError('City is required to add a church', 'HMC_INVALID_CITY', 400);
  }
  if (!state) {
    throw new HmcPartnerError(
      'state must be a Here’s My Church region abbreviation',
      'HMC_INVALID_STATE',
      400,
    );
  }
  if (!Number.isFinite(options.lat) || !Number.isFinite(options.lng)) {
    throw new HmcPartnerError('Valid coordinates are required', 'HMC_INVALID_COORDS', 400);
  }

  const config = readHmcConfig();
  const edgeRoot = readHmcEdgeRoot();
  const url = `${edgeRoot}/churches/add`;
  const payload: Record<string, unknown> = {
    name,
    city,
    state,
    lat: options.lat,
    lng: options.lng,
    address: (options.address ?? '').trim(),
  };
  if (options.confirmAdd) payload.confirmAdd = true;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        ...partnerHeaders(config),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
    needsConfirmation?: boolean;
    similar?: unknown[];
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
  // Near-duplicate gate (HMC v2): bind best similar match for silent auto-submit.
  if (body.needsConfirmation && Array.isArray(body.similar)) {
    for (const row of body.similar) {
      const similar = normalizeLeanChurch(row);
      if (similar) return { church: similar, isDuplicate: true };
    }
  }
  throw new HmcPartnerError('Here’s My Church add returned no church', 'HMC_UPSTREAM_ERROR', 502);
}

export type HmcSubmitUnlistedResult = {
  church: HmcLeanChurch | null;
  place: HmcGeocodedPlace | null;
};

/**
 * Best-effort: geocode + submit a church that wasn’t in the directory.
 * Prefer a freeform `address` (street, city, region); structured city/state still work.
 */
export async function hmcSubmitUnlistedChurch(options: {
  name: string;
  country?: string | null;
  /** Freeform address including city + region (preferred). */
  address?: string | null;
  city?: string | null;
  state?: string | null;
}): Promise<HmcSubmitUnlistedResult> {
  if (!isHmcConfigured()) return { church: null, place: null };

  const country =
    (options.country ?? '').trim().toUpperCase() ||
    hmcCountryForRegion(options.state) ||
    'US';
  const freeform = (options.address ?? '').trim();

  let place: HmcGeocodedPlace | null = null;
  if (freeform) {
    place = await hmcGeocodeAddress({ address: freeform, country });
  }
  if (!place) {
    const city = (options.city ?? '').trim();
    const state = (options.state ?? '').trim();
    if (!city || !state) return { church: null, place: null };
    const coords = await hmcGeocodePlace({
      city,
      state,
      country,
      address: freeform || null,
    });
    if (!coords) return { church: null, place: null };
    place = {
      lat: coords.lat,
      lng: coords.lng,
      city,
      state: normalizeHmcRegionCode(state) ?? state,
      country,
      address: freeform || null,
    };
  }

  try {
    const result = await hmcAddChurch({
      name: options.name,
      city: place.city,
      state: place.state,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
    });
    return { church: result.church, place };
  } catch (error) {
    if (error instanceof HmcPartnerError && error.code === 'HMC_RATE_LIMITED') throw error;
    console.warn('[hmcSubmitUnlistedChurch]', error instanceof Error ? error.message : error);
    return { church: null, place };
  }
}

/** @deprecated Prefer hmcSubmitUnlistedChurch (multi-country). */
export async function hmcSubmitUnlistedUsChurch(options: {
  name: string;
  city: string;
  state: string;
  address?: string | null;
}): Promise<HmcLeanChurch | null> {
  const result = await hmcSubmitUnlistedChurch({ ...options, country: 'US' });
  return result.church;
}
