import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'hono';

const mockGetUserDefaultTranslation = vi.fn();
const mockGetUserTradition = vi.fn(() => 'protestant');
let nowIso = '2026-06-26T12:00:00.000Z';
const mockGetAuth = vi.fn();
const mockFirst = vi.fn();
const mockLimit = vi.fn();
const mockSelect = vi.fn();

vi.mock('../../db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  eq: (...args: unknown[]) => args,
  desc: (...args: unknown[]) => args,
  lte: (...args: unknown[]) => args,
  first: (...args: unknown[]) => mockFirst(...args),
}));

vi.mock('../../db/dates', () => ({
  now: () => new Date(nowIso),
}));

vi.mock('../../middleware/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
}));

vi.mock('../votd-user-translation', () => ({
  getUserReadingPrefs: async (...args: unknown[]) => ({
    translation: await mockGetUserDefaultTranslation(...args),
    tradition: mockGetUserTradition(),
  }),
}));

const mockFetchVerseText = vi.fn();
const mockVotdActedOnToday = vi.fn();
vi.mock('../fetch-verse-text', () => ({
  fetchVerseText: (...args: unknown[]) => mockFetchVerseText(...args),
}));
vi.mock('../votd-record-engagement', () => ({
  votdActedOnToday: (...args: unknown[]) => mockVotdActedOnToday(...args),
}));

import { votdTodayPublicHandler } from '../votd-today-public';

function makeContext(query: Record<string, string> = {}): Context {
  const headers = new Map<string, string>();
  return {
    req: {
      query: (key: string) => query[key] ?? '',
      header: (name: string) => headers.get(name) ?? '',
    },
    res: {
      headers: {
        set: vi.fn(),
        append: vi.fn(),
      },
    },
    json: (body: unknown) => body,
  } as unknown as Context;
}

function mockExactVotdRow(row: { reference: string; translation: string } | null) {
  mockLimit.mockResolvedValueOnce(row ? [row] : []);
  mockSelect.mockReturnValueOnce({
    from: () => ({
      where: () => ({
        limit: mockLimit,
      }),
    }),
  });
}

describe('votdTodayPublicHandler translation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirst.mockImplementation((rows: unknown) => (Array.isArray(rows) ? rows[0] : undefined));
    mockFetchVerseText.mockResolvedValue('');
    mockVotdActedOnToday.mockResolvedValue(false);
  });

  it('returns catalog translation when unauthenticated', async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    mockExactVotdRow({ reference: 'Romans 8:28', translation: 'NET' });

    const result = await votdTodayPublicHandler(makeContext({ tz: 'UTC' }));
    expect(result).toEqual({ reference: 'Romans 8:28', translation: 'NET' });
    expect(mockGetUserDefaultTranslation).not.toHaveBeenCalled();
  });

  it('returns user default translation when authenticated', async () => {
    mockGetAuth.mockReturnValue({ userId: 'user_abc' });
    mockGetUserDefaultTranslation.mockResolvedValue('ESV');
    mockExactVotdRow({ reference: 'John 3:16', translation: 'NET' });

    const result = await votdTodayPublicHandler(makeContext({ tz: 'UTC' }));
    // No words came back here, so no `textHtml`; `actedToday` is always answered for a member.
    expect(result).toEqual({ reference: 'John 3:16', translation: 'ESV', actedToday: false });
    expect(mockGetUserDefaultTranslation).toHaveBeenCalledWith('user_abc');
  });
});

describe('votdTodayPublicHandler for a member', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirst.mockImplementation((rows: unknown) => (Array.isArray(rows) ? rows[0] : undefined));
    mockGetAuth.mockReturnValue({ userId: 'user_abc' });
    mockGetUserDefaultTranslation.mockResolvedValue('NET');
  });

  function mockRow() {
    mockLimit.mockResolvedValueOnce([
      { reference: 'Psalm 18:1-2', translation: 'NET', featuredItemId: 'votd_fi_1' },
    ]);
    mockSelect.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: mockLimit }) }) });
  }

  it('sends the words and whether they already acted on it', async () => {
    mockRow();
    mockFetchVerseText.mockResolvedValue('<sup class="verse-num">1</sup>I love you, LORD');
    mockVotdActedOnToday.mockResolvedValue(false);
    const result = await votdTodayPublicHandler(makeContext({ tz: 'UTC' }));
    expect(result).toEqual({
      reference: 'Psalm 18:1-2',
      translation: 'NET',
      textHtml: '<sup class="verse-num">1</sup>I love you, LORD',
      actedToday: false,
    });
    expect(mockFetchVerseText).toHaveBeenCalledWith('Psalm 18:1-2', 'NET');
    expect(mockVotdActedOnToday).toHaveBeenCalledWith('user_abc', 'votd_fi_1');
  });

  it('keeps the reference when the words cannot be fetched', async () => {
    mockRow();
    mockFetchVerseText.mockRejectedValue(new Error('pool timeout'));
    mockVotdActedOnToday.mockResolvedValue(true);
    const result = await votdTodayPublicHandler(makeContext({ tz: 'UTC' }));
    // No `textHtml` key at all: the app reads its absence as "show the row".
    expect(result).toEqual({ reference: 'Psalm 18:1-2', translation: 'NET', actedToday: true });
  });

  it('sends neither to a signed-out visitor', async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    mockRow();
    const result = await votdTodayPublicHandler(makeContext({ tz: 'UTC' }));
    expect(result).toEqual({ reference: 'Psalm 18:1-2', translation: 'NET' });
    expect(mockFetchVerseText).not.toHaveBeenCalled();
  });
});

describe('votdTodayPublicHandler for a Catholic reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirst.mockImplementation((rows: unknown) => (Array.isArray(rows) ? rows[0] : undefined));
    mockFetchVerseText.mockResolvedValue('<sup class="verse-num">15</sup>Then the Pharisees went off');
    mockVotdActedOnToday.mockResolvedValue(false);
    mockGetUserDefaultTranslation.mockResolvedValue('NABRE');
  });

  function mockRow() {
    mockLimit.mockResolvedValueOnce([{ reference: 'Psalm 18:1-2', translation: 'NET', featuredItemId: 'votd_fi_1' }]);
    mockSelect.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: mockLimit }) }) });
  }

  it("gives a member the Sunday's Gospel, with the other readings, from the account's tradition", async () => {
    nowIso = '2026-10-18T15:00:00.000Z'; // 29th Sunday in Ordinary Time, Year A
    mockGetAuth.mockReturnValue({ userId: 'user_abc' });
    mockGetUserTradition.mockReturnValue('catholic');
    mockRow();
    const result = (await votdTodayPublicHandler(makeContext({ tz: 'UTC' }))) as Record<string, unknown>;
    expect(result.reference).toBe('Matthew 22:15-21');
    expect(mockFetchVerseText).toHaveBeenCalledWith('Matthew 22:15-21', 'NABRE');
    // Engagement still keys on the day's verse row.
    expect(mockVotdActedOnToday).toHaveBeenCalledWith('user_abc', 'votd_fi_1');
    expect(result.readings).toMatchObject({
      title: '29th Sunday in Ordinary Time',
      items: [
        { slot: 'first', citation: 'Isaiah 45:1, 4-6', reference: 'Isaiah 45:1, 4-6' },
        { slot: 'psalm', citation: 'Psalm 96:1, 3, 4-5, 7-8, 9-10', reference: 'Psalms 96:1, 3-5, 7-10' },
        { slot: 'second', citation: '1 Thessalonians 1:1-5b' },
        { slot: 'gospel', citation: 'Matthew 22:15-21' },
      ],
    });
  });

  it("ignores the query for a member: the account decides", async () => {
    nowIso = '2026-10-18T15:00:00.000Z';
    mockGetAuth.mockReturnValue({ userId: 'user_abc' });
    mockGetUserTradition.mockReturnValue('protestant');
    mockRow();
    const result = (await votdTodayPublicHandler(makeContext({ tz: 'UTC', tradition: 'catholic' }))) as Record<string, unknown>;
    expect(result.reference).toBe('Psalm 18:1-2');
    expect(result.readings).toBeUndefined();
  });

  it('answers a guest who asks for the Catholic readings', async () => {
    nowIso = '2026-10-18T15:00:00.000Z';
    mockGetAuth.mockReturnValue({ userId: null });
    mockRow();
    const result = (await votdTodayPublicHandler(makeContext({ tz: 'UTC', tradition: 'catholic' }))) as Record<string, unknown>;
    expect(result.reference).toBe('Matthew 22:15-21');
    expect(result.readings).toBeDefined();
  });

  it("keeps Today's passage on a weekday with no proper readings", async () => {
    nowIso = '2026-10-15T15:00:00.000Z';
    mockGetAuth.mockReturnValue({ userId: 'user_abc' });
    mockGetUserTradition.mockReturnValue('catholic');
    mockRow();
    const result = (await votdTodayPublicHandler(makeContext({ tz: 'UTC' }))) as Record<string, unknown>;
    expect(result.reference).toBe('Psalm 18:1-2');
    expect(result.readings).toBeUndefined();
  });
});
