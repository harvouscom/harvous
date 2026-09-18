import { beforeEach, describe, expect, it } from 'vitest';
import {
  addGuestNote,
  clearGuestStore,
  guestNotes,
  subscribeToGuestStore,
  updateGuestNote,
} from '../guest-store';

const STORE_KEY = 'harvous-proto-guest-store';

/**
 * What another tab does: write the key directly, then the browser tells every *other* tab.
 *
 * jsdom does not fire `storage` for this document's own writes, and neither does a browser —
 * which is why the event has to be dispatched by hand here.
 */
function writeFromAnotherTab(notes: unknown[]) {
  const next = JSON.stringify({ version: 1, highlights: [], notes, prefs: {} });
  localStorage.setItem(STORE_KEY, next);
  window.dispatchEvent(new StorageEvent('storage', { key: STORE_KEY, newValue: next }));
}

/**
 * A guest with the app open twice.
 *
 * Every write is read-modify-write against the copy this tab holds in memory, and nothing
 * told that copy another tab had written. So the second tab's next autosave put its stale copy
 * back, and the note written in the first tab was gone.
 */
describe('guest store across tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    clearGuestStore();
  });

  it("keeps a note another tab wrote when this tab saves next", () => {
    const mine = addGuestNote({ title: 'Mine', contentHtml: '<p>One.</p>' });
    // This tab has now read — and cached — a store holding only its own note.
    expect(guestNotes()).toHaveLength(1);

    writeFromAnotherTab([
      ...guestNotes(),
      { id: 'guest_note_other', title: 'Theirs', contentHtml: '<p>Two.</p>', createdAt: '', updatedAt: '' },
    ]);

    updateGuestNote(mine.id, { contentHtml: '<p>One, edited.</p>' });

    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}').notes;
    expect(stored.map((n: { title: string }) => n.title)).toEqual(['Mine', 'Theirs']);
    expect(stored[0].contentHtml).toBe('<p>One, edited.</p>');
  });

  it("tells this tab's subscribers, so its lists show the other tab's note", () => {
    let heard = 0;
    const unsubscribe = subscribeToGuestStore(() => {
      heard += 1;
    });

    writeFromAnotherTab([
      { id: 'guest_note_other', title: 'Theirs', contentHtml: '<p>Two.</p>', createdAt: '', updatedAt: '' },
    ]);
    unsubscribe();

    expect(heard).toBe(1);
    expect(guestNotes().map((n) => n.title)).toEqual(['Theirs']);
  });

  it('ignores writes to other keys', () => {
    addGuestNote({ title: 'Mine', contentHtml: '<p>One.</p>' });
    let heard = 0;
    const unsubscribe = subscribeToGuestStore(() => {
      heard += 1;
    });

    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: '1' }));
    unsubscribe();

    expect(heard).toBe(0);
  });
});
