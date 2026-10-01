/**
 * OAuth discovery for the Connector. Clerk is the authorization server; this API is only
 * the protected resource, so all it publishes is where to go (RFC 9728) and, for older
 * clients that still look for authorization-server metadata on the resource's own origin,
 * a cached copy of Clerk's.
 *
 * Written in-house rather than taken from `@clerk/mcp-tools/server`: the helpers are a few
 * lines, and the published package's token verifier predates resource (audience) binding.
 */

import { clerkPublishableKey, connectorResourceUrl } from './config';

/** Clerk's Frontend API origin, encoded in the publishable key (`pk_live_<base64 host$>`). */
export function clerkFrontendApiUrl(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, '');
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
  return `https://${host}`;
}

export function protectedResourceMetadata(
  publishableKey = clerkPublishableKey(),
  resourceUrl = connectorResourceUrl(),
) {
  if (!publishableKey) return null;
  return {
    resource: resourceUrl,
    authorization_servers: [clerkFrontendApiUrl(publishableKey)],
    bearer_methods_supported: ['header'],
    scopes_supported: ['profile', 'email'],
    resource_name: 'Harvous',
  };
}

const AUTH_SERVER_TTL_MS = 60 * 60 * 1000;
let authServerCache: { at: number; body: unknown } | null = null;

export async function authorizationServerMetadata(
  publishableKey = clerkPublishableKey(),
  now = Date.now(),
): Promise<unknown | null> {
  if (!publishableKey) return null;
  if (authServerCache && now - authServerCache.at < AUTH_SERVER_TTL_MS) return authServerCache.body;
  const res = await fetch(`${clerkFrontendApiUrl(publishableKey)}/.well-known/oauth-authorization-server`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Clerk authorization-server metadata: HTTP ${res.status}`);
  const body: unknown = await res.json();
  authServerCache = { at: now, body };
  return body;
}
