/**
 * Netlify Function entry point.
 *
 * Wraps the Hono app as a single catch-all Netlify Function.
 * All /api/* requests are routed here by netlify.toml redirects.
 * Exports both default (modern) and handler (legacy CJS) so Netlify finds the function.
 *
 * Handles both modern (Request) and legacy (event) invocation so Hono always
 * receives a proper Request with a valid .url (avoids getPath/indexOf crash).
 */

import { handle } from 'hono/netlify';
import app from './app';

const honoHandler = handle(app);

type LegacyEvent = {
  path?: string;
  httpMethod?: string;
  headers?: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body?: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string>;
};

function isLegacyEvent(arg: unknown): arg is LegacyEvent {
  if (!arg || typeof arg !== 'object') return false;
  const o = arg as Record<string, unknown>;
  return 'path' in o && 'httpMethod' in o && !('url' in o && typeof (arg as Request).url === 'string');
}

/** Merge event.headers and event.multiValueHeaders so Cookie and other headers are never dropped (Lambda/Netlify legacy). */
function mergeHeaders(event: LegacyEvent): Record<string, string> {
  const out: Record<string, string> = { ...(event.headers ?? {}) };
  const multi = event.multiValueHeaders;
  if (!multi || typeof multi !== 'object') return out;
  for (const [key, values] of Object.entries(multi)) {
    if (!Array.isArray(values) || values.length === 0) continue;
    const lower = key.toLowerCase();
    if (lower === 'cookie') {
      out[key] = values.join('; ');
    } else {
      out[key] = values[0];
    }
  }
  return out;
}

/** Netlify redirect sends /api/* to /.netlify/functions/api/:splat; legacy event.path is the function path. Normalize so Hono sees /api/... */
function normalizePath(path: string): string {
  if (path.startsWith('/.netlify/functions/api')) {
    return '/api' + path.slice('/.netlify/functions/api'.length) || '/api';
  }
  return path;
}

function legacyEventToRequest(event: LegacyEvent): Request {
  const path = normalizePath(event.path ?? '/');
  const headers = mergeHeaders(event);
  const host = headers['x-forwarded-host'] ?? headers['host'] ?? headers['Host'] ?? 'localhost';
  const proto = headers['x-forwarded-proto'] ?? 'https';
  const origin = `${proto}://${host}`;
  const search = event.queryStringParameters
    ? '?' + new URLSearchParams(event.queryStringParameters).toString()
    : '';
  const url = `${origin}${path}${search}`;
  const method = (event.httpMethod ?? 'GET').toUpperCase();

  let body: string | Buffer | undefined;
  if (event.body != null && event.body !== '') {
    if (event.isBase64Encoded === true) {
      try {
        body = Buffer.from(event.body, 'base64');
      } catch {
        body = event.body;
      }
    } else {
      body = event.body;
    }
  }
  return new Request(url, { method, headers: new Headers(headers), body });
}

async function responseToLegacy(res: Response): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  const body = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { statusCode: res.status, body, headers };
}

async function handler(reqOrEvent: Request | unknown, context: unknown): Promise<Response | { statusCode: number; body: string; headers: Record<string, string> }> {
  const isLegacy = isLegacyEvent(reqOrEvent);
  let req: Request;
  if (isLegacy) {
    req = legacyEventToRequest(reqOrEvent);
  } else if (reqOrEvent && typeof (reqOrEvent as Request).url === 'string') {
    req = reqOrEvent as Request;
  } else {
    req = new Request('https://localhost/', { method: 'GET' });
  }
  const res = await honoHandler(req, context);
  return isLegacy ? responseToLegacy(res) : res;
}

export default handler;
export { handler };
