import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishShellMode } from '../../../spa/src/lib/guest-session';
import { recordAudiencefulMilestoneOnce } from '../audienceful-milestones-client';

/**
 * The milestone route is `requireAuth`, so a guest's every note open was a guaranteed 401.
 * A guest sends nothing — and does not use up the once-per-session flag, so the same tab
 * still records the milestone after they sign up.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('recordAudiencefulMilestoneOnce', () => {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve({ ok: true }),
  );

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    publishShellMode('account');
    vi.unstubAllGlobals();
  });

  it('sends nothing for a guest', async () => {
    publishShellMode('guest');
    recordAudiencefulMilestoneOnce('note_opened');
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still records once the guest has an account', async () => {
    publishShellMode('guest');
    recordAudiencefulMilestoneOnce('note_opened');

    publishShellMode('account');
    recordAudiencefulMilestoneOnce('note_opened');
    recordAudiencefulMilestoneOnce('note_opened');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/user/audienceful-milestones');
  });
});
