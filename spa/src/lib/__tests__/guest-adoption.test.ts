import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptGuestWork } from '../guest-adoption';
import { addGuestHighlight, clearGuestStore, guestHighlights } from '../guest-store';
import { clearGuestSession, hasGuestSession, startGuestSession } from '../guest-session';

const SPACE = 'space_home';

function seedHighlight(reference: string) {
  addGuestHighlight({
    book: 'Psalms',
    chapter: 34,
    translation: 'NET',
    reference,
    accent: 'violet',
    spanKey: null,
    excerpt: 'excerpt',
  });
}

describe('adoptGuestWork', () => {
  beforeEach(() => {
    localStorage.clear();
    clearGuestStore();
    clearGuestSession();
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

  it('posts each highlight to the account, then clears both stores', async () => {
    startGuestSession();
    seedHighlight('Psalms 34:1');
    seedHighlight('Psalms 34:8');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await adoptGuestWork(SPACE);

    expect(result).toEqual({ adoptedHighlights: 2, failed: 0 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // The space id is the whole reason adoption waits for navigation to answer — a highlight
    // saved without one is a row the Highlights list can never find again.
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ reference: 'Psalms 34:1', spaceId: SPACE, translation: 'NET' });

    expect(guestHighlights()).toEqual([]);
    expect(hasGuestSession()).toBe(false);
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
