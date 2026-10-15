import { describe, expect, it, vi } from 'vitest';
import {
  assertPublicHttpUrl,
  fetchPublicText,
  isNonPublicAddress,
  UnsafeUrlError,
  type LookupFn,
} from '../public-url-fetch';

const resolvesTo =
  (map: Record<string, string[]>): LookupFn =>
  async (host) =>
    (map[host] ?? []).map((address) => ({ address }));

const PUBLIC = resolvesTo({ 'example.org': ['93.184.215.14'], 'cdn.example.org': ['93.184.215.15'] });

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fdaa:0:1::2',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1',
    'not-an-ip',
  ])('refuses %s', (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each(['93.184.215.14', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s',
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false);
    },
  );
});

describe('assertPublicHttpUrl', () => {
  it.each([
    ['file:///etc/passwd', 'Only http'],
    ['http://127.0.0.1/', 'private'],
    ['http://10.0.0.5/admin', 'private'],
    ['http://169.254.169.254/latest/meta-data/', 'private'],
    ['http://[::1]/', 'private'],
    ['https://example.org:5432/', 'ports'],
    ['https://user:pass@example.org/', 'credentials'],
    ['https://nowhere.invalid/', 'resolve'],
  ])('refuses %s', async (url, message) => {
    await expect(assertPublicHttpUrl(url, PUBLIC)).rejects.toThrow(message);
  });

  it('refuses localhost by what it resolves to, not by name', async () => {
    const lookup = resolvesTo({ localhost: ['127.0.0.1'] });
    await expect(assertPublicHttpUrl('http://localhost:80/', lookup)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('refuses a host if any one of its addresses is private', async () => {
    const lookup = resolvesTo({ 'split.example': ['93.184.215.14', '10.0.0.1'] });
    await expect(assertPublicHttpUrl('https://split.example/', lookup)).rejects.toThrow('private');
  });

  it('allows an ordinary public page', async () => {
    const url = await assertPublicHttpUrl('https://example.org/article', PUBLIC);
    expect(url.toString()).toBe('https://example.org/article');
  });
});

describe('fetchPublicText', () => {
  const html = (body: string, init: ResponseInit = {}) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

  it('re-checks every redirect hop', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    await expect(
      fetchPublicText('https://example.org/', { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: PUBLIC }),
    ).rejects.toThrow('private');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('follows a public redirect and reports where it landed', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://cdn.example.org/a' } }))
      .mockResolvedValueOnce(html('<p>hi</p>'));
    const result = await fetchPublicText('https://example.org/', { fetchImpl, lookup: PUBLIC });
    expect(result.url.toString()).toBe('https://cdn.example.org/a');
    expect(result.body).toBe('<p>hi</p>');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('stops after too many redirects', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://example.org/again' } }),
    );
    await expect(
      fetchPublicText('https://example.org/', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        lookup: PUBLIC,
        maxRedirects: 2,
      }),
    ).rejects.toThrow('Too many redirects');
  });

  it('caps the body', async () => {
    const fetchImpl = vi.fn(async () => html('x'.repeat(5000)));
    const result = await fetchPublicText('https://example.org/', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: PUBLIC,
      maxBytes: 1000,
    });
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(1000);
  });
});
