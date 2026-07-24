/**
 * Shared Paddle Billing client for Netlify-bundled API (node_bundler = none).
 */

import { Environment, Paddle } from '@paddle/paddle-node-sdk';

let cached: Paddle | null = null;

export function isPaddleConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY);
}

export function getPaddleEnvironment(): Environment {
  const env = (process.env.PADDLE_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live' ? Environment.production : Environment.sandbox;
}

export function getPaddleClient(): Paddle {
  if (cached) return cached;
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    throw new Error('PADDLE_API_KEY is not configured');
  }
  cached = new Paddle(apiKey, { environment: getPaddleEnvironment() });
  return cached;
}

/** First comma-split value — Netlify can duplicate headers as `"v, v"`. */
export function firstHeaderValue(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return value.includes(',') ? value.split(',')[0]!.trim() : value.trim();
}
