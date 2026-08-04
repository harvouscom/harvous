import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Encodes the save trail that finally identified the phantom "changed somewhere else"
 * conflict on single-user notes:
 *
 *   attempt  expected=3  len=48     ← save A leaves
 *   attempt  expected=3  len=385    ← save B leaves while A is in flight, SAME version
 *   ok       -> v4                  ← A lands
 *   conflict expected=3 current=4   ← B rejected
 *
 * expectedVersion is read from the cache at send time, so any two saves whose round
 * trips overlap both carry the stale number. Editor mounts serialize their own saves,
 * but not each other's — and a compose adopt runs two mounts. The fix chains saves
 * per note inside useUpdateNote (the one layer every writer shares) and adopts the
 * server's version in-band, so save B waits for A and then reads v4.
 */
const putBodies: Array<Record<string, unknown>> = [];
let resolvers: Array<(value: unknown) => void> = [];

vi.mock('../../../lib/api', () => ({
  APIError: class APIError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
    }
  },
  api: {
    put: vi.fn((_path: string, body: Record<string, unknown>) => {
      putBodies.push(body);
      return new Promise((resolve) => resolvers.push(resolve));
    }),
    get: vi.fn(),
    post: vi.fn(),
  },
}));
vi.mock('@/utils/offline-mutations', () => ({ updateNoteOffline: vi.fn() }));

import { useUpdateNote } from '../useUpdateNote';

function seededClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(['note', 'note_1'], {
    id: 'note_1',
    title: 'T',
    content: '<p>body</p>',
    noteType: 'default',
    contentEncrypted: false,
    isPublic: false,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    threads: [],
    tags: [],
    currentVersion: 3,
    currentVersionId: 'nver_3',
    // Forces the direct api.put path (no offline queue) — co-edited notes never queue.
    coEditEnabled: true,
  });
  return qc;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('per-note save serialization', () => {
  it('holds a second save until the first lands, then sends the fresh version', async () => {
    putBodies.length = 0;
    resolvers = [];
    const qc = seededClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    const p1 = result.current.mutateAsync({ noteId: 'note_1', title: 'T', content: '<p>a</p>' });
    await flush();
    expect(putBodies).toHaveLength(1);
    expect(putBodies[0].expectedVersion).toBe(3);

    // Second save while the first is still in flight — the trail's exact shape.
    const p2 = result.current.mutateAsync({ noteId: 'note_1', title: 'T', content: '<p>ab</p>' });
    await flush();
    // Serialized: it must NOT have gone out yet.
    expect(putBodies).toHaveLength(1);

    // First save lands on v4.
    resolvers[0]({ success: true, currentVersion: 4, currentVersionId: 'nver_4' });
    await waitFor(() => expect(putBodies).toHaveLength(2));
    // The whole bug: this used to be 3.
    expect(putBodies[1].expectedVersion).toBe(4);

    resolvers[1]({ success: true, currentVersion: 5, currentVersionId: 'nver_5' });
    await p1;
    await p2;
  });

  it('a failed save does not wedge the chain for the next one', async () => {
    putBodies.length = 0;
    resolvers = [];
    const qc = seededClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    const p1 = result.current.mutateAsync({ noteId: 'note_1', title: 'T', content: '<p>a</p>' });
    await flush();
    const p2 = result.current.mutateAsync({ noteId: 'note_1', title: 'T', content: '<p>ab</p>' });
    await flush();

    // First save blows up entirely.
    const { APIError } = await import('../../../lib/api');
    (resolvers[0] as unknown as (v: unknown) => void)(
      Promise.reject(new APIError(500, 'boom')),
    );
    await expect(p1).rejects.toThrow();

    // Second still goes out, with the version the cache still holds.
    await waitFor(() => expect(putBodies).toHaveLength(2));
    expect(putBodies[1].expectedVersion).toBe(3);
    resolvers[1]({ success: true, currentVersion: 4, currentVersionId: 'nver_4' });
    await p2;
  });
});
