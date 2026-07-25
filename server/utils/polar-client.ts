/**
 * Shared Polar client for the Netlify-bundled API (node_bundler = none).
 *
 * Polar is the merchant of record: it owns VAT/GST/sales-tax registration,
 * collection, and filing. Sandbox and production are separate environments
 * with different access tokens and ids.
 */

import { Polar } from '@polar-sh/sdk';

let cached: Polar | null = null;

export function isPolarConfigured(): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN);
}

export function getPolarServer(): 'sandbox' | 'production' {
  const env = (process.env.POLAR_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? 'production' : 'sandbox';
}

export function getPolarClient(): Polar {
  if (cached) return cached;
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('POLAR_ACCESS_TOKEN is not configured');
  }
  cached = new Polar({ accessToken, server: getPolarServer() });
  return cached;
}

/**
 * First value when Netlify duplicates a header, joining copies with ", "
 * (comma-space). Split on ", " — NOT a bare "," — because Polar's Standard
 * Webhooks `webhook-signature` value legitimately contains a comma (`v1,<sig>`,
 * with multiple sigs space-separated), so a bare-comma split would corrupt it.
 * Same reasoning as the Clerk svix `dedupeSvixHeaders` workaround.
 */
export function firstHeaderValue(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return value.includes(', ') ? value.split(', ')[0]!.trim() : value.trim();
}
