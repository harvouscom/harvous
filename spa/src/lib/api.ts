/**
 * SPA API client.
 * Prefer Clerk session JWT as Bearer (avoids cold-start cookie races); still send cookies
 * for same-origin session continuity. In Capacitor / split-origin builds, VITE_API_BASE_URL
 * may point at the production API host.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

import { reportApiDiagnostic } from '@/utils/diagnostics-client';

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

type GetTokenFn = () => Promise<string | null>;

let clerkGetToken: GetTokenFn | null = null;

/** Register Clerk `getToken` from inside `<ClerkProvider>` (see ClerkTokenBridge). */
export function setClerkGetToken(fn: GetTokenFn | null): void {
  clerkGetToken = fn;
}

/** Clerk session JWT when available — preferred over relying on __session cookie timing. */
export async function getClerkBearerToken(): Promise<string | null> {
  if (clerkGetToken) {
    try {
      return (await clerkGetToken()) || null;
    } catch {
      /* fall through */
    }
  }
  if (typeof window === 'undefined') return null;
  try {
    const clerk = (
      window as unknown as {
        Clerk?: { session?: { getToken?: () => Promise<string | null> } };
      }
    ).Clerk;
    const token = await clerk?.session?.getToken?.();
    return token || null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? undefined);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  // Avoid Content-Type on GET/HEAD so requests stay "simple" for cross-origin (Capacitor / split-origin dev).
  // FormData must not get application/json — the browser sets multipart boundary.
  if (
    init.body !== undefined &&
    init.body !== null &&
    init.body !== '' &&
    !isFormData &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Authorization')) {
    const token = await getClerkBearerToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    // Let the server's Cache-Control headers work (e.g. max-age=30, stale-while-revalidate=60).
    // React Query's staleTime already prevents redundant refetches on the client side.
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
    const errMessage = body.error || `HTTP ${res.status}`;
    reportApiDiagnostic(path, res.status, errMessage);
    throw new APIError(res.status, errMessage, body.code);
  }

  return res.json() as Promise<T>;
}

/**
 * Resolve a same-origin-or-configured API URL for raw `fetch` calls that the typed
 * `api` helpers can't express (file downloads, multipart/FormData uploads).
 */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return body;
  return JSON.stringify(body);
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number>) => {
    const url = params
      ? `${path}?${new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)])
          )
        )}`
      : path;
    return request<T>(url);
  },
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: serializeBody(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: serializeBody(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: serializeBody(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: serializeBody(body) }),
};
