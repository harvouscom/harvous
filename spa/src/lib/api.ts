/**
 * SPA API client.
 * In the browser (web + Capacitor WebView), Clerk manages auth cookies automatically.
 * All requests go to the same origin (proxied to the Astro/Netlify backend in dev,
 * or directly to https://app.harvous.com in production native builds).
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    // Let the server's Cache-Control headers work (e.g. max-age=30, stale-while-revalidate=60).
    // React Query's staleTime already prevents redundant refetches on the client side.
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new APIError(res.status, body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
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
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};
