/**
 * Who owns the organize sheets, and what happens when hosts come and go.
 *
 * The unpublish guard is the whole reason this is not a plain variable. Effect cleanup runs
 * *after* the next mount's effect during a remount, so a host tearing down would otherwise
 * wipe the host that had already replaced it — leaving the app with no way to carry out a
 * verb, which is exactly the failure this store exists to end.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  publishOrganizeApi,
  useOrganizeApi,
  type OrganizeApi,
} from '../prototype-organize-runner-store';

function api(): OrganizeApi {
  return { run: vi.fn(), canCreateCollections: true, openCreateFolder: vi.fn(), openCreateThread: vi.fn() };
}

/** Everything published during a test, torn down so the module never leaks between them. */
const cleanups: Array<() => void> = [];
function publish(next: OrganizeApi): () => void {
  const off = publishOrganizeApi(next);
  cleanups.push(off);
  return off;
}
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

describe('what a caller sees', () => {
  it('is null before any host has mounted', () => {
    const { result } = renderHook(() => useOrganizeApi());
    expect(result.current).toBeNull();
  });

  it('is the published host, and updates in place', () => {
    const { result, rerender } = renderHook(() => useOrganizeApi());
    const first = api();
    publish(first);
    rerender();
    expect(result.current).toBe(first);
  });

  it('is the later host when one replaces another', () => {
    const { result, rerender } = renderHook(() => useOrganizeApi());
    publish(api());
    const second = api();
    publish(second);
    rerender();
    expect(result.current).toBe(second);
  });
});

describe('tearing down', () => {
  it('clears the store when the only host unmounts', () => {
    const { result, rerender } = renderHook(() => useOrganizeApi());
    const off = publish(api());
    off();
    rerender();
    expect(result.current).toBeNull();
  });

  it('does not let a stale unpublish clear the host that replaced it', () => {
    const { result, rerender } = renderHook(() => useOrganizeApi());
    const offFirst = publish(api());
    const second = api();
    publish(second);
    /* The remount ordering: the first host's cleanup runs after the second has published. */
    offFirst();
    rerender();
    expect(result.current).toBe(second);
  });
});

describe('the retirement it enforces', () => {
  it('leaves no sidebar to own a second copy of the note bulk chrome', async () => {
    /*
     * This used to read `PrototypeSidebar.tsx` and assert the absences one by one —
     * `useDeleteNotesBatch`, `bulkShareSheetOpen`, and three more — because each was a copy of
     * something this host now owns, and each grows back easily: a "quick fix" adding a confirm
     * there would silently give one verb two behaviours again.
     *
     * The rail is gone, so the guard gets to be the stronger statement. A file that does not
     * exist cannot grow a second copy of anything, and re-creating it is the thing worth
     * failing on — whoever does will have to decide, deliberately, where the verbs live.
     */
    const { existsSync } = await import('node:fs');
    expect(existsSync('spa/src/pages/prototype/PrototypeSidebar.tsx')).toBe(false);
  });

  it('keeps the surfaces that replaced it going through the host', async () => {
    /* The other half of the same guard: the verbs have one runner, and the surfaces that took
       the rail's job reach them through it rather than re-implementing any. */
    const { readFileSync } = await import('node:fs');
    for (const surface of [
      'spa/src/pages/prototype/library-panel/PrototypeLibraryBulkBar.tsx',
      'spa/src/pages/prototype/PrototypeOrganizeCommandHost.tsx',
    ]) {
      const src = readFileSync(surface, 'utf8');
      for (const gone of ['useDeleteNotesBatch', 'useRemoveNotesFromSpaceBatch']) {
        if (surface.includes('BulkBar')) expect(src).not.toContain(gone);
      }
    }
  });
});
