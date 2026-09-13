/**
 * Reading the Discover catalog whole, not its first page.
 *
 * The app's Templates tab was empty while harvous.com listed six templates. The server pages
 * newest-first, 24 at a time, and the resources had all been listed after the templates — so
 * page one held none of them, and the app never asked for page two.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DiscoverListing, DiscoverListingsResponse } from '../useDiscoverListings';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));
vi.mock('../../useAuthReady', () => ({ useAuthReady: () => true }));
vi.mock('@/hooks/queries/useVotdPreview', () => ({
  useHarvousAdminCheck: () => ({ data: null }),
}));

const { fetchAllDiscoverListings, DISCOVER_MAX_PAGES } = await import('../useDiscoverListings');

function listing(slug: string, kind: DiscoverListing['kind']): DiscoverListing {
  return {
    slug,
    kind,
    title: slug,
    description: null,
    category: null,
    authorDisplayName: null,
    preview: null,
    installCount: 0,
    listedAt: null,
  };
}

function page(listings: DiscoverListing[], installedSlugs: string[], nextCursor: string | null) {
  return { listings, installedSlugs, nextCursor } satisfies DiscoverListingsResponse;
}

describe('fetchAllDiscoverListings', () => {
  it('follows the cursor to the last page, so rows past the first are not lost', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(page([listing('the-new-testament', 'resource')], [], 'cursor-1'))
      .mockResolvedValueOnce(page([listing('soap', 'template')], [], null));

    const all = await fetchAllDiscoverListings(get);

    expect(all.listings.map((row) => row.slug)).toEqual(['the-new-testament', 'soap']);
    expect(all.nextCursor).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'cursor-1' }));
  });

  it('merges "already yours" from every page, since each page only marks its own rows', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(page([listing('a', 'resource')], ['a'], 'cursor-1'))
      .mockResolvedValueOnce(page([listing('soap', 'template')], ['soap'], null));

    const all = await fetchAllDiscoverListings(get);
    expect([...all.installedSlugs].sort()).toEqual(['a', 'soap']);
  });

  it('carries the caller’s filters onto every page', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(page([], [], 'cursor-1'))
      .mockResolvedValueOnce(page([], [], null));

    await fetchAllDiscoverListings(get, { kind: 'template' });
    expect(get).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'template' }));
    expect(get).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'template', cursor: 'cursor-1' }));
  });

  it('stops at the page cap on a cursor that never ends, and says there is more', async () => {
    const get = vi.fn().mockResolvedValue(page([listing('again', 'note')], [], 'again'));

    const all = await fetchAllDiscoverListings(get);
    expect(get).toHaveBeenCalledTimes(DISCOVER_MAX_PAGES);
    expect(all.nextCursor).toBe('again');
  });
});
