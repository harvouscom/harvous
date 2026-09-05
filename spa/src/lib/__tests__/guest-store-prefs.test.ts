import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addGuestNote, clearGuestStore, guestNotes, guestPrefs, setGuestPrefs } from '../guest-store';

const STORE_KEY = 'harvous-proto-guest-store';

/**
 * A fresh module instance over whatever is on disk — what a new tab does.
 *
 * The store holds a parsed copy in memory so `useSyncExternalStore` gets a stable identity,
 * so reading it again in this process would answer from that copy rather than from storage.
 */
async function reopenStore() {
  vi.resetModules();
  return import('../guest-store');
}

/**
 * A guest's settings, kept where their work is.
 *
 * The translation switch used to POST to `/api/user/update-translation`, get a 401, and
 * revert its own optimistic write — so the chapter in front of them changed and the next one
 * opened in the old version. Reading in the version you chose needs no account.
 */
describe('guest prefs', () => {
  beforeEach(() => {
    localStorage.clear();
    clearGuestStore();
  });

  it('starts empty rather than inventing a default', () => {
    expect(guestPrefs()).toEqual({});
  });

  it('keeps a chosen translation across a reload', async () => {
    setGuestPrefs({ defaultTranslation: 'ESV' });

    const reopened = await reopenStore();

    expect(reopened.guestPrefs().defaultTranslation).toBe('ESV');
  });

  it('merges rather than replacing, and leaves the work alone', () => {
    addGuestNote({ title: 'Psalm 34', contentHtml: '<p>Taste and see.</p>' });
    setGuestPrefs({ defaultTranslation: 'NLT' });
    setGuestPrefs({});

    expect(guestPrefs().defaultTranslation).toBe('NLT');
    expect(guestNotes()).toHaveLength(1);
  });

  it('reads a store written before prefs existed', async () => {
    // The shape on disk for anyone who was already a guest when this shipped: no `prefs` key.
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        version: 1,
        highlights: [],
        notes: [{ id: 'guest_note_1', title: 'Kept', contentHtml: '<p>One.</p>', createdAt: '', updatedAt: '' }],
      }),
    );

    const reopened = await reopenStore();

    expect(reopened.guestPrefs()).toEqual({});
    // The absent key is a default, not a migration — the work it sat beside is untouched.
    expect(reopened.guestNotes()).toHaveLength(1);
  });
});
