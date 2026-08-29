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
  return { run: vi.fn(), openCreateFolder: vi.fn(), openCreateThread: vi.fn() };
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
  it('leaves the sidebar owning none of the note bulk chrome', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('spa/src/pages/prototype/PrototypeSidebar.tsx', 'utf8');
    /* Each was a copy of something the host now owns, and each grows back easily — a "quick
       fix" adding a confirm here would silently give one verb two behaviours again. */
    for (const gone of [
      'useDeleteNotesBatch',
      'useRemoveNotesFromSpaceBatch',
      'bulkShareSheetOpen',
      'bulkDeleteConfirmOpen',
      'PrototypeCreateThreadSheet',
    ]) {
      expect(src).not.toContain(gone);
    }
    expect(src).toContain('useOrganizeApi');
  });
});
