import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIError } from '../../../lib/api';

vi.mock('@/utils/user-id', () => ({ getPersistedUserId: () => 'user_1' }));
vi.mock('@/utils/offline-mode', () => ({ isOfflineModeEnabled: () => true }));

import { runOfflineFirst, isOfflineError } from '../withOfflineQueue';

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

describe('isOfflineError', () => {
  beforeEach(() => setOnline(true));

  it('treats a server APIError (responded) as NOT offline', () => {
    expect(isOfflineError(new APIError(400, 'bad'))).toBe(false);
  });

  it('treats a thrown network/TypeError as offline', () => {
    expect(isOfflineError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('treats anything as offline when navigator is offline', () => {
    setOnline(false);
    expect(isOfflineError(new APIError(400, 'bad'))).toBe(true);
  });
});

describe('runOfflineFirst', () => {
  beforeEach(() => setOnline(true));

  it('returns the server result and does NOT enqueue when online succeeds', async () => {
    const offline = vi.fn();
    const out = await runOfflineFirst({ online: async () => ({ ok: 1 }), offline });
    expect(out).toEqual({ online: { ok: 1 }, queued: false, localId: null });
    expect(offline).not.toHaveBeenCalled();
  });

  it('rethrows a genuine server rejection (4xx) so the caller can roll back', async () => {
    const offline = vi.fn();
    await expect(
      runOfflineFirst({
        online: async () => {
          throw new APIError(422, 'too long');
        },
        offline,
      }),
    ).rejects.toBeInstanceOf(APIError);
    expect(offline).not.toHaveBeenCalled();
  });

  it('queues offline (no throw) when the network call fails offline', async () => {
    setOnline(false);
    const offline = vi.fn(async () => 'local_abc');
    const out = await runOfflineFirst({
      online: async () => {
        throw new TypeError('Failed to fetch');
      },
      offline,
    });
    expect(offline).toHaveBeenCalledWith('user_1');
    expect(out).toEqual({ online: null, queued: true, localId: 'local_abc' });
  });

  it('rethrows when the durable offline write fails', async () => {
    setOnline(false);
    const offline = vi.fn(async () => {
      throw new Error('IndexedDB quota exceeded');
    });
    await expect(
      runOfflineFirst({
        online: async () => {
          throw new TypeError('Failed to fetch');
        },
        offline,
      }),
    ).rejects.toThrow('IndexedDB quota exceeded');
  });
});
