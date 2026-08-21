import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * The point of this cache is that a link is resolved once. Everything below is really one
 * question asked four ways: did we go to the network when we already knew the answer?
 *
 * Module state is per-import, so each test loads a fresh copy — otherwise the first test's
 * cache would answer the second test's questions.
 */

const STORAGE_KEY = 'harvous.linkMetadata.v1';
const URL_A = 'https://example.com/a';

function mockMetadataResponse(metadata: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ metadata }),
  } as unknown as Response);
}

async function freshModule() {
  vi.resetModules();
  return import('../link-metadata');
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('link metadata cache', () => {
  it('knows nothing about a link it has not seen', async () => {
    const m = await freshModule();
    expect(m.peekLinkMetadata(URL_A)).toBeNull();
  });

  it('asks once, then answers from memory', async () => {
    const fetchMock = mockMetadataResponse({ title: 'A page', siteName: 'Example' });
    vi.stubGlobal('fetch', fetchMock);
    const m = await freshModule();

    const first = await m.fetchLinkMetadata(URL_A);
    const second = await m.fetchLinkMetadata(URL_A);

    expect(first?.title).toBe('A page');
    expect(second?.title).toBe('A page');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent asks for the same link into one request', async () => {
    // Two hovers in quick succession, or a hover landing on a paste still in flight.
    const fetchMock = mockMetadataResponse({ title: 'A page' });
    vi.stubGlobal('fetch', fetchMock);
    const m = await freshModule();

    await Promise.all([m.fetchLinkMetadata(URL_A), m.fetchLinkMetadata(URL_A)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('survives a reload, which is the whole reason it is not just a Map', async () => {
    const fetchMock = mockMetadataResponse({ title: 'A page', siteName: 'Example' });
    vi.stubGlobal('fetch', fetchMock);
    const first = await freshModule();
    await first.fetchLinkMetadata(URL_A);

    // A new page load: fresh module state, same session storage.
    const afterReload = await freshModule();
    const known = afterReload.peekLinkMetadata(URL_A);

    expect(known?.siteName).toBe('Example');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failure, so a flaky link can be tried again', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as unknown as Response));
    const m = await freshModule();

    expect(await m.fetchLinkMetadata(URL_A)).toBeNull();
    expect(m.peekLinkMetadata(URL_A)).toBeNull();
  });

  it('treats a rejected request as unknown rather than throwing into a paste', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const m = await freshModule();

    await expect(m.fetchLinkMetadata(URL_A)).resolves.toBeNull();
  });

  it('shrugs off unreadable stored data', async () => {
    sessionStorage.setItem(STORAGE_KEY, 'not json');
    const m = await freshModule();

    expect(m.peekLinkMetadata(URL_A)).toBeNull();
  });

  it('prefetching is fire-and-forget — it returns nothing and cannot throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const m = await freshModule();

    expect(m.prefetchLinkMetadata(URL_A)).toBeUndefined();
    expect(() => m.prefetchLinkMetadata('')).not.toThrow();
  });
});
