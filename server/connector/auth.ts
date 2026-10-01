/**
 * Connector authentication: a Clerk-issued OAuth access token, and nothing else.
 *
 * Deliberately separate from `clerkAuth` (server/middleware/auth.ts), which accepts session
 * tokens only and refuses OAuth tokens. The isolation runs both ways: a session token is
 * refused here (`acceptsToken: 'oauth_token'`), and a Connector token can never act as a
 * session on `/api/*`. Cookies are ignored entirely.
 *
 * No live→dev `ClerkUserMapping` merge happens here. It is a heavy write, the final user id
 * is always the token's `sub` anyway, and anyone holding Plus has signed in to the app — where
 * that merge already ran.
 */

import { createHash } from 'node:crypto';
import { createClerkClient } from '@clerk/backend';
import { clerkPublishableKey, connectorResourceUrl, protectedResourceMetadataUrl } from './config';

export interface ConnectorAuth {
  userId: string;
  clientId: string;
  scopes: string[];
  token: string;
}

type AuthResult = { ok: true; auth: ConnectorAuth } | { ok: false; reason: 'missing' | 'invalid' };

const CACHE_TTL_MS = 60_000;
const verified = new Map<string, { auth: ConnectorAuth; until: number }>();

function bearerFrom(request: Request): string | null {
  const header = (request.headers.get('authorization') ?? '').split(',')[0].trim();
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `exp` and `aud` from a JWT access token Clerk has already verified; null for opaque tokens. */
function jwtClaims(token: string): { exp?: number; aud?: string | string[] } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      exp?: number;
      aud?: string | string[];
    };
  } catch {
    return null;
  }
}

/**
 * Audience binding (RFC 8707). When the token names an audience, it must name this server,
 * so a token minted for some other resource on the same Clerk instance is refused. Tokens
 * that carry no audience are accepted: Clerk does not yet stamp one on dynamically
 * registered clients' opaque tokens, and those are scoped to this Clerk instance regardless.
 */
export function audienceAllows(aud: string | string[] | undefined, resourceUrl: string): boolean {
  if (aud == null) return true;
  const list = Array.isArray(aud) ? aud : [aud];
  const want = resourceUrl.replace(/\/+$/, '');
  return list.some((a) => a.replace(/\/+$/, '') === want);
}

let clerkClient: ReturnType<typeof createClerkClient> | null = null;
function clerk() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = clerkPublishableKey();
  if (!secretKey || !publishableKey) {
    throw new Error('[connector] CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required');
  }
  clerkClient ??= createClerkClient({ secretKey, publishableKey });
  return clerkClient;
}

export async function authenticateConnectorRequest(request: Request, now = Date.now()): Promise<AuthResult> {
  const token = bearerFrom(request);
  if (!token) return { ok: false, reason: 'missing' };

  const key = tokenKey(token);
  const cached = verified.get(key);
  if (cached && cached.until > now) return { ok: true, auth: cached.auth };
  if (cached) verified.delete(key);

  try {
    const state = await clerk().authenticateRequest(request, { acceptsToken: 'oauth_token' });
    const auth = state.toAuth();
    if (!state.isAuthenticated || !auth || auth.tokenType !== 'oauth_token' || !auth.userId || !auth.clientId) {
      return { ok: false, reason: 'invalid' };
    }
    const claims = jwtClaims(token);
    if (!audienceAllows(claims?.aud, connectorResourceUrl())) {
      console.warn('[connector] refused a token issued for another audience');
      return { ok: false, reason: 'invalid' };
    }
    const result: ConnectorAuth = {
      userId: auth.userId,
      clientId: auth.clientId,
      scopes: Array.isArray(auth.scopes) ? auth.scopes : [],
      token,
    };
    // Never cache past the token's own expiry.
    const expMs = claims?.exp ? claims.exp * 1000 : Infinity;
    verified.set(key, { auth: result, until: Math.min(now + CACHE_TTL_MS, expMs) });
    if (verified.size > 5_000) {
      for (const [k, v] of verified) if (v.until <= now) verified.delete(k);
    }
    return { ok: true, auth: result };
  } catch (error) {
    console.warn('[connector] token verification failed:', error instanceof Error ? error.message : error);
    return { ok: false, reason: 'invalid' };
  }
}

/** RFC 6750 + RFC 9728: tell the client where to find our authorization server. */
export function unauthorizedResponse(reason: 'missing' | 'invalid'): Response {
  const parts = [`resource_metadata="${protectedResourceMetadataUrl()}"`];
  if (reason === 'invalid') parts.push('error="invalid_token"');
  return new Response(
    JSON.stringify({
      error: reason === 'invalid' ? 'invalid_token' : 'unauthorized',
      error_description:
        reason === 'invalid' ? 'The access token is invalid or expired.' : 'Sign in to Harvous to connect.',
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'WWW-Authenticate': `Bearer ${parts.join(', ')}`,
      },
    },
  );
}

/** Test hook: forget verified tokens. */
export function __resetConnectorAuthCache(): void {
  verified.clear();
  clerkClient = null;
}
