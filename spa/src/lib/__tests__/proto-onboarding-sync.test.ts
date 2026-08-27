import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PROTO_ONBOARDING_KEY,
  PROTO_ONBOARDING_PENDING_KEY,
} from '../../layouts/proto-session-keys';
import {
  emptyOnboardingState,
  markStep,
  parseOnboardingState,
  serializeOnboardingState,
} from '@/utils/onboarding-state';

const post = vi.fn();
const get = vi.fn();

vi.mock('../api', () => ({
  api: {
    post: (...args: unknown[]) => post(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

async function loadModule() {
  vi.resetModules();
  const mod = await import('../proto-onboarding-sync');
  mod.resetOnboardingStateForTests();
  return mod;
}

const T1 = '2026-08-01T10:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  get.mockReset();
});

describe('first paint', () => {
  it('reports fromCache=false when this device has never stored a checklist', async () => {
    const { getOnboardingSnapshot, updateOnboardingState } = await loadModule();
    updateOnboardingState((s) => s); // force the lazy load without changing anything
    const snap = getOnboardingSnapshot();
    expect(snap.fromCache).toBe(false);
    expect(snap.hydrated).toBe(false);
  });

  it('paints from the localStorage cache and says so', async () => {
    localStorage.setItem(
      PROTO_ONBOARDING_KEY,
      serializeOnboardingState(markStep(emptyOnboardingState(), 'note', T1)),
    );
    const { getOnboardingSnapshot, updateOnboardingState } = await loadModule();
    updateOnboardingState((s) => s);
    const snap = getOnboardingSnapshot();
    expect(snap.fromCache).toBe(true);
    expect(snap.state?.steps.note.done).toBe(true);
  });

  it('falls back to a pending edit when the cache write was the thing that failed', async () => {
    localStorage.setItem(
      PROTO_ONBOARDING_PENDING_KEY,
      serializeOnboardingState(markStep(emptyOnboardingState(), 'pill', T1)),
    );
    const { getOnboardingSnapshot, updateOnboardingState } = await loadModule();
    updateOnboardingState((s) => s);
    expect(getOnboardingSnapshot().state?.steps.pill.done).toBe(true);
  });
});

describe('local edits', () => {
  it('writes the cache and marks the edit pending', async () => {
    post.mockResolvedValue({});
    const { updateOnboardingState } = await loadModule();
    updateOnboardingState((s) => markStep(s, 'read', T1));

    expect(parseOnboardingState(localStorage.getItem(PROTO_ONBOARDING_KEY))?.steps.read.done).toBe(
      true,
    );
    expect(parseOnboardingState(localStorage.getItem(PROTO_ONBOARDING_PENDING_KEY))?.steps.read.done).toBe(
      true,
    );
  });

  it('notifies subscribers only when something actually changed', async () => {
    post.mockResolvedValue({});
    const { updateOnboardingState, subscribeOnboardingState } = await loadModule();
    const seen = vi.fn();
    subscribeOnboardingState(seen);

    updateOnboardingState((s) => markStep(s, 'read', T1));
    expect(seen).toHaveBeenCalledTimes(1);

    // Re-marking a done step is a no-op, and a no-op must not re-render Home.
    updateOnboardingState((s) => markStep(s, 'read', '2026-09-01T00:00:00.000Z'));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('account hydration', () => {
  it('merges the account copy in rather than replacing the local one', async () => {
    post.mockResolvedValue({});
    const { updateOnboardingState, handleOnboardingAccountSync, getOnboardingSnapshot } =
      await loadModule();

    // This device did 'read' while offline; the account knows about 'highlight'.
    updateOnboardingState((s) => markStep(s, 'read', T1));
    handleOnboardingAccountSync(
      serializeOnboardingState(markStep(emptyOnboardingState(), 'highlight', T1)),
    );

    const state = getOnboardingSnapshot().state!;
    expect(state.steps.read.done).toBe(true);
    expect(state.steps.highlight.done).toBe(true);
  });

  it('flips hydrated even when the account has stored nothing', async () => {
    const { handleOnboardingAccountSync, getOnboardingSnapshot } = await loadModule();
    handleOnboardingAccountSync(null);
    expect(getOnboardingSnapshot().hydrated).toBe(true);
  });

  it('leaves hydrated false when the profile request fails', async () => {
    get.mockRejectedValue(new Error('offline'));
    const { fetchAndHydrateOnboardingFromProfile, getOnboardingSnapshot } = await loadModule();
    await fetchAndHydrateOnboardingFromProfile();
    expect(getOnboardingSnapshot().hydrated).toBe(false);
  });

  it('accepts a profile the caller already fetched, without a second request', async () => {
    const { fetchAndHydrateOnboardingFromProfile, getOnboardingSnapshot } = await loadModule();
    await fetchAndHydrateOnboardingFromProfile({
      onboardingState: serializeOnboardingState(markStep(emptyOnboardingState(), 'note', T1)),
    });
    expect(get).not.toHaveBeenCalled();
    expect(getOnboardingSnapshot().state?.steps.note.done).toBe(true);
  });
});

describe('scripture-pill latch', () => {
  function confirmEvent(detail: { reference: string; isNew: boolean }) {
    return new CustomEvent('scriptureDraftConfirmed', { detail });
  }

  it('marks the pill step when the editor confirms a brand-new reference', async () => {
    post.mockResolvedValue({});
    const { initOnboardingAccountSync, getOnboardingSnapshot } = await loadModule();
    initOnboardingAccountSync();

    window.dispatchEvent(confirmEvent({ reference: 'John 3:16', isNew: true }));
    expect(getOnboardingSnapshot().state?.steps.pill.done).toBe(true);
  });

  it('ignores a re-confirmed edit of an existing pill', async () => {
    post.mockResolvedValue({});
    const { initOnboardingAccountSync, getOnboardingSnapshot } = await loadModule();
    initOnboardingAccountSync();

    window.dispatchEvent(confirmEvent({ reference: 'John 3:17', isNew: false }));
    expect(getOnboardingSnapshot().state?.steps.pill.done).toBe(false);
  });
});

describe('push', () => {
  it('clears the pending marker and folds the merged response back in', async () => {
    vi.useFakeTimers();
    const serverCopy = serializeOnboardingState(
      markStep(markStep(emptyOnboardingState(), 'read', T1), 'thread', T1),
    );
    post.mockResolvedValue({ onboardingState: serverCopy });

    const { updateOnboardingState, getOnboardingSnapshot } = await loadModule();
    updateOnboardingState((s) => markStep(s, 'read', T1));

    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(post).toHaveBeenCalledWith('/api/user/update-onboarding', expect.anything());
    expect(localStorage.getItem(PROTO_ONBOARDING_PENDING_KEY)).toBeNull();
    // 'thread' came back from another device via the merged response.
    expect(getOnboardingSnapshot().state?.steps.thread.done).toBe(true);
  });

  it('keeps the pending marker when the push fails, so it retries later', async () => {
    vi.useFakeTimers();
    post.mockRejectedValue(new Error('offline'));

    const { updateOnboardingState } = await loadModule();
    updateOnboardingState((s) => markStep(s, 'read', T1));

    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(localStorage.getItem(PROTO_ONBOARDING_PENDING_KEY)).not.toBeNull();
  });
});
