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

function isLegacyEvent(arg: unknown): arg is { path?: string; httpMethod?: string; headers?: Record<string, string>; body?: string | null; queryStringParameters?: Record<string, string> } {
  if (!arg || typeof arg !== 'object') return false;
  const o = arg as Record<string, unknown>;
  return 'path' in o && 'httpMethod' in o && !('url' in o && typeof (arg as Request).url === 'string');
}

function legacyEventToRequest(event: { path?: string; httpMethod?: string; headers?: Record<string, string>; body?: string | null; queryStringParameters?: Record<string, string> }): Request {
  const path = event.path ?? '/';
  const headers = event.headers ?? {};
  const host = headers['x-forwarded-host'] ?? headers['host'] ?? 'localhost';
  const proto = headers['x-forwarded-proto'] ?? 'https';
  const origin = `${proto}://${host}`;
  const search = event.queryStringParameters
    ? '?' + new URLSearchParams(event.queryStringParameters).toString()
    : '';
  const url = `${origin}${path}${search}`;
  const method = (event.httpMethod ?? 'GET').toUpperCase();
  const body = event.body != null && event.body !== '' ? event.body : undefined;
  return new Request(url, { method, headers: new Headers(headers), body });
}

async function handler(reqOrEvent: Request | unknown, context: unknown): Promise<Response> {
  let req: Request;
  if (isLegacyEvent(reqOrEvent)) {
    req = legacyEventToRequest(reqOrEvent);
  } else if (reqOrEvent && typeof (reqOrEvent as Request).url === 'string') {
    req = reqOrEvent as Request;
  } else {
    req = new Request('https://localhost/', { method: 'GET' });
  }
  return honoHandler(req, context);
}

export default handler;
export { handler };
