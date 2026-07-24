/**
 * Verify Paddle Billing webhook signatures (Paddle-Signature: ts=…;h1=…).
 * Netlify may duplicate headers — callers should pass the first comma-split value.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { firstHeaderValue } from './paddle-client';

export function parsePaddleSignatureHeader(header: string | undefined | null): {
  ts: string | null;
  h1: string | null;
} {
  const raw = firstHeaderValue(header) ?? '';
  let ts: string | null = null;
  let h1: string | null = null;
  for (const part of raw.split(';')) {
    const [key, value] = part.split('=', 2);
    if (key?.trim() === 'ts' && value) ts = value.trim();
    if (key?.trim() === 'h1' && value) h1 = value.trim();
  }
  return { ts, h1 };
}

export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | undefined | null,
  secret: string,
  maxSkewSeconds = 60 * 5,
): boolean {
  const { ts, h1 } = parsePaddleSignatureHeader(signatureHeader);
  if (!ts || !h1 || !secret) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const skew = Math.abs(Date.now() / 1000 - tsNum);
  if (skew > maxSkewSeconds) return false;

  const signedPayload = `${ts}:${rawBody}`;
  const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(h1, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
