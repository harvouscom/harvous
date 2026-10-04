import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCachedPassageHistory, getPassageHistory, passageHistoryLabel } from '../passage-history';

function mockFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getPassageHistory', () => {
  it('asks passage-notes for one row, excluding the note being edited', async () => {
    const fetchFn = mockFetch({ success: true, total: 3, notes: [{ title: 'Night with Nicodemus' }] });
    const history = await getPassageHistory('John 3:16', 'note_abc');
    expect(history).toEqual({ total: 3, newestTitle: 'Night with Nicodemus' });
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain('/api/scripture/passage-notes?');
    expect(url).toContain('reference=John+3%3A16');
    expect(url).toContain('limit=1');
    expect(url).toContain('noteId=note_abc');
  });

  it('remembers an answer for the session', async () => {
    mockFetch({ success: true, total: 0, notes: [] });
    await getPassageHistory('Romans 8:28', null);
    const again = mockFetch({ success: true, total: 9, notes: [] });
    expect(await getPassageHistory('Romans 8:28', null)).toEqual({ total: 0, newestTitle: null });
    expect(again).not.toHaveBeenCalled();
    expect(getCachedPassageHistory('Romans 8:28', null)).toEqual({ total: 0, newestTitle: null });
  });

  it('does not remember a failure', async () => {
    mockFetch({}, false);
    expect(await getPassageHistory('Acts 2:42', null)).toBeNull();
    expect(getCachedPassageHistory('Acts 2:42', null)).toBeNull();
  });

  it('treats a network error as no answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getPassageHistory('Psalms 23', null)).toBeNull();
  });
});

describe('passageHistoryLabel', () => {
  it('says nothing when there is no other note', () => {
    expect(passageHistoryLabel(null)).toBeNull();
    expect(passageHistoryLabel({ total: 0, newestTitle: null })).toBeNull();
  });

  it('names the one other note', () => {
    expect(passageHistoryLabel({ total: 1, newestTitle: 'Night with Nicodemus' })).toBe(
      'Also in “Night with Nicodemus”',
    );
    expect(passageHistoryLabel({ total: 1, newestTitle: null })).toBe('Also in 1 other note');
  });

  it('shortens a long title', () => {
    const label = passageHistoryLabel({
      total: 1,
      newestTitle: 'A very long note title about the whole of the Upper Room Discourse',
    });
    expect(label).toMatch(/^Also in “.{1,32}”$/);
    expect(label).toContain('…');
  });

  it('counts several notes', () => {
    expect(passageHistoryLabel({ total: 4, newestTitle: 'x' })).toBe('Also in 4 of your notes');
  });
});
