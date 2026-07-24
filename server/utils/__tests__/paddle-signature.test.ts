import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { parsePaddleSignatureHeader, verifyPaddleSignature } from '../paddle-signature';
import { firstHeaderValue } from '../paddle-client';

describe('firstHeaderValue (Netlify duplicate headers)', () => {
  it('returns the first comma-split value', () => {
    expect(firstHeaderValue('ts=1;h1=abc, ts=1;h1=abc')).toBe('ts=1;h1=abc');
  });

  it('passes through a single value', () => {
    expect(firstHeaderValue('ts=1;h1=abc')).toBe('ts=1;h1=abc');
  });
});

describe('parsePaddleSignatureHeader', () => {
  it('parses ts and h1', () => {
    expect(parsePaddleSignatureHeader('ts=1700000000;h1=deadbeef')).toEqual({
      ts: '1700000000',
      h1: 'deadbeef',
    });
  });

  it('dedupes Netlify-duplicated signature headers before parse', () => {
    const duplicated = 'ts=1700000000;h1=deadbeef, ts=1700000000;h1=deadbeef';
    expect(parsePaddleSignatureHeader(duplicated)).toEqual({
      ts: '1700000000',
      h1: 'deadbeef',
    });
  });
});

describe('verifyPaddleSignature', () => {
  const secret = 'test_webhook_secret';
  const body = '{"event_type":"subscription.activated"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const h1 = createHmac('sha256', secret).update(`${ts}:${body}`, 'utf8').digest('hex');

  it('accepts a valid signature', () => {
    expect(verifyPaddleSignature(body, `ts=${ts};h1=${h1}`, secret)).toBe(true);
  });

  it('accepts a valid signature when Netlify duplicates the header', () => {
    const header = `ts=${ts};h1=${h1}, ts=${ts};h1=${h1}`;
    expect(verifyPaddleSignature(body, header, secret)).toBe(true);
  });

  it('rejects a bad digest', () => {
    expect(verifyPaddleSignature(body, `ts=${ts};h1=${'0'.repeat(64)}`, secret)).toBe(false);
  });
});
