import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'hono';

const mockGetUserDefaultTranslation = vi.fn();
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
  now: () => new Date('2026-06-26T12:00:00.000Z'),
}));

vi.mock('../../middleware/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
}));

vi.mock('../votd-user-translation', () => ({
  getUserDefaultTranslation: (...args: unknown[]) => mockGetUserDefaultTranslation(...args),
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
    expect(result).toEqual({ reference: 'John 3:16', translation: 'ESV' });
    expect(mockGetUserDefaultTranslation).toHaveBeenCalledWith('user_abc');
  });
});
