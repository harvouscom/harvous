/**
 * The recent-search store, which had no tests while it was the only storage module in the
 * codebase parsing `localStorage` without a guard.
 *
 * The two hardening cases at the bottom are the reason this file exists: this module is read
 * during a render, so "storage threw" has to come back as an empty list rather than as a
 * blank panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECENT_SEARCH_MAX,
  addRecentSearchTerm,
  clearRecentSearches,
  readRecentSearchTerms,
  recentSearchStorageKey,
  recentSearchesUpdatedEvent,
  removeRecentSearchTerm,
  subscribeRecentSearches,
} from '../recent-search-storage';

const KEY = recentSearchStorageKey(null);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reading', () => {
  it('normalises the two stored shapes', () => {
    /* Bare strings predate entries carrying a result count. Both shapes are still on disk in
       the wild, so both have to read back as an entry. */
    window.localStorage.setItem(KEY, JSON.stringify(['patience', { term: 'mercy', count: 4 }]));

    expect(readRecentSearchTerms(null)).toEqual([
      { term: 'patience', count: 0 },
      { term: 'mercy', count: 4 },
    ]);
  });

  it('filters terms below the length floor without rewriting them', () => {
    /* A read that writes is a surprise in a function called from a render. These can only
       come from a build older than the floor, and nothing can add one now. */
    window.localStorage.setItem(KEY, JSON.stringify([{ term: 'ab', count: 0 }, 'grace']));

    expect(readRecentSearchTerms(null)).toEqual([{ term: 'grace', count: 0 }]);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')).toHaveLength(2);
  });

  it('honours a smaller limit', () => {
    addRecentSearchTerm(null, 'one hundred');
    addRecentSearchTerm(null, 'two hundred');

    expect(readRecentSearchTerms(null, 1)).toEqual([{ term: 'two hundred', count: 0 }]);
  });
});

describe('adding', () => {
  it('is most-recently-used, and moves a repeat to the front rather than duplicating it', () => {
    addRecentSearchTerm(null, 'patience');
    addRecentSearchTerm(null, 'mercy');
    addRecentSearchTerm(null, 'patience');

    expect(readRecentSearchTerms(null).map((e) => e.term)).toEqual(['patience', 'mercy']);
  });

  it('caps the list', () => {
    for (let i = 0; i < RECENT_SEARCH_MAX + 5; i += 1) addRecentSearchTerm(null, `term ${i}`);

    expect(readRecentSearchTerms(null)).toHaveLength(RECENT_SEARCH_MAX);
  });

  it('keeps the previous badge count when none is supplied', () => {
    /* The count comes from a settled FTS response. Re-adding from a path that has no count
       must not blank a badge that was already right. */
    addRecentSearchTerm(null, 'patience', { resultCount: 7 });
    addRecentSearchTerm(null, 'patience');

    expect(readRecentSearchTerms(null)).toEqual([{ term: 'patience', count: 7 }]);
  });

  it('replaces the badge when a new count is supplied', () => {
    addRecentSearchTerm(null, 'patience', { resultCount: 7 });
    addRecentSearchTerm(null, 'patience', { resultCount: 2 });

    expect(readRecentSearchTerms(null)).toEqual([{ term: 'patience', count: 2 }]);
  });

  it('refuses a term below the length floor', () => {
    addRecentSearchTerm(null, 'ab');

    expect(readRecentSearchTerms(null)).toEqual([]);
  });
});

describe('removing and clearing', () => {
  it('drops one term', () => {
    addRecentSearchTerm(null, 'patience');
    addRecentSearchTerm(null, 'mercy');
    removeRecentSearchTerm(null, 'patience');

    expect(readRecentSearchTerms(null).map((e) => e.term)).toEqual(['mercy']);
  });

  it('removes the key entirely rather than storing an empty list', () => {
    /* Clearing history should leave nothing behind that says a history was ever kept. */
    addRecentSearchTerm(null, 'patience');
    clearRecentSearches(null);

    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe('scoping', () => {
  it('keeps a space list separate from the personal one', () => {
    addRecentSearchTerm(null, 'patience');
    addRecentSearchTerm({ type: 'space', id: 'sp1' }, 'mercy');

    expect(readRecentSearchTerms(null).map((e) => e.term)).toEqual(['patience']);
    expect(readRecentSearchTerms({ type: 'space', id: 'sp1' }).map((e) => e.term)).toEqual(['mercy']);
  });

  it('wakes only the subscriber for the scope that changed', () => {
    const personal = vi.fn();
    const space = vi.fn();
    const offPersonal = subscribeRecentSearches(null, personal);
    const offSpace = subscribeRecentSearches({ type: 'space', id: 'sp1' }, space);

    addRecentSearchTerm(null, 'patience');

    expect(personal).toHaveBeenCalledTimes(1);
    expect(space).not.toHaveBeenCalled();

    offPersonal();
    offSpace();
  });
});

describe('when storage misbehaves', () => {
  it('reads an empty list rather than throwing on corrupt JSON', () => {
    window.localStorage.setItem(KEY, '{not json');

    expect(() => readRecentSearchTerms(null)).not.toThrow();
    expect(readRecentSearchTerms(null)).toEqual([]);
  });

  it('reads an empty list when the stored value is not an array', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ term: 'patience' }));

    expect(readRecentSearchTerms(null)).toEqual([]);
  });

  it('does not throw when reading is blocked outright', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => readRecentSearchTerms(null)).not.toThrow();
    expect(readRecentSearchTerms(null)).toEqual([]);
  });

  it('does not throw when writing is blocked, and still announces', () => {
    /* The announce matters on a failed write: whichever surface did update in memory would
       otherwise be the only one showing the new value. */
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const heard = vi.fn();
    window.addEventListener(recentSearchesUpdatedEvent(null), heard);

    expect(() => addRecentSearchTerm(null, 'patience')).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);

    window.removeEventListener(recentSearchesUpdatedEvent(null), heard);
  });
});
