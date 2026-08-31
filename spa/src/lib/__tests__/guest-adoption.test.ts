import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptGuestWork } from '../guest-adoption';
import { addGuestHighlight, clearGuestStore, guestHighlights } from '../guest-store';
import { clearGuestSession, hasGuestSession, startGuestSession } from '../guest-session';
import { pushOnboardingStateToAccount } from '../proto-onboarding-sync';

/*
 * Mocked because the real push goes through `api.post`, which wants a Clerk token — the wrong
 * layer to assert at. What adoption owes the account is that it *asks* for the checklist to be
 * sent; whether that request succeeds is the sync module's contract, tested there.
 */
vi.mock('../proto-onboarding-sync', () => ({
  pushOnboardingStateToAccount: vi.fn(async () => true),
}));

const SPACE = 'space_home';
const HIGHLIGHTS_URL = '/api/scripture/highlights';

/** Only the highlight writes — adoption also pushes the checklist, which is not what these count. */
function highlightCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter((c) => String(c[0]) === HIGHLIGHTS_URL);
}

function seedHighlight(reference: string, miniNoteBody?: string) {
  addGuestHighlight({
    book: 'Psalms',
    chapter: 34,
    translation: 'NET',
    reference,
    accent: 'violet',
    spanKey: null,
    excerpt: 'excerpt',
    ...(miniNoteBody ? { miniNoteBody } : {}),
  });
}

describe('adoptGuestWork', () => {
  beforeEach(() => {
    localStorage.clear();
    clearGuestStore();
    clearGuestSession();
    vi.mocked(pushOnboardingStateToAccount).mockClear();
    vi.restoreAllMocks();
  });

  it('does nothing when this browser was never a guest', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await adoptGuestWork(SPACE)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears the marker for a guest who looked around and made nothing', async () => {
    startGuestSession();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(await adoptGuestWork(SPACE)).toBeNull();

    // The point of the run: without this the new member keeps the guest row forever.
    expect(hasGuestSession()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the checklist up even when nothing was made', async () => {
    startGuestSession();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await adoptGuestWork(SPACE);

    /*
     * Someone can finish "Open the Bible" without creating anything the store holds. The
     * ordinary write path pushes only when the state changes, and after signup the seed on Home
     * computes no change — so without this a checklist someone genuinely completed would stay
     * on one device forever.
     */
    expect(pushOnboardingStateToAccount).toHaveBeenCalled();
    expect(hasGuestSession()).toBe(false);
  });

  it('posts each highlight to the account, then clears both stores', async () => {
    startGuestSession();
    seedHighlight('Psalms 34:1');
    seedHighlight('Psalms 34:8');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await adoptGuestWork(SPACE);

    expect(result).toEqual({ adoptedHighlights: 2, failed: 0 });
    expect(highlightCalls(fetchSpy)).toHaveLength(2);

    // The space id is the whole reason adoption waits for navigation to answer — a highlight
    // saved without one is a row the Highlights list can never find again.
    const body = JSON.parse(String((highlightCalls(fetchSpy)[0][1] as RequestInit).body));
    expect(body).toMatchObject({ reference: 'Psalms 34:1', spaceId: SPACE, translation: 'NET' });

    expect(guestHighlights()).toEqual([]);
    expect(hasGuestSession()).toBe(false);
  });

  it('carries the note written on a verse up with the highlight', async () => {
    startGuestSession();
    seedHighlight('Psalms 34:1', 'this is the part that mattered');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await adoptGuestWork(SPACE);

    // One request, not two: the create endpoint takes miniNoteBody, so a highlight can never
    // arrive in the account with the words missing.
    expect(highlightCalls(fetchSpy)).toHaveLength(1);
    const body = JSON.parse(String((highlightCalls(fetchSpy)[0][1] as RequestInit).body));
    expect(body.miniNoteBody).toBe('this is the part that mattered');
  });

  it('keeps the work on the device when a write fails', async () => {
    startGuestSession();
    seedHighlight('Psalms 34:1');
    seedHighlight('Psalms 34:8');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }));

    const result = await adoptGuestWork(SPACE);

    expect(result).toEqual({ adoptedHighlights: 1, failed: 1 });
    // Both survive: clearing either one on a partial run is how a guest's work disappears.
    expect(guestHighlights()).toHaveLength(2);
    expect(hasGuestSession()).toBe(true);
  });

  it('survives a network error rather than throwing into the shell', async () => {
    startGuestSession();
    seedHighlight('Psalms 34:1');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(adoptGuestWork(SPACE)).resolves.toEqual({ adoptedHighlights: 0, failed: 1 });
    expect(hasGuestSession()).toBe(true);
  });
});
