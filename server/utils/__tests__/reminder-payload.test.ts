/**
 * Reminder copy follows the account's default translation, and a verse reminder opens the
 * reader on the passage it quotes, in that same translation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFirst = vi.fn();
const mockSelect = vi.fn();
const mockResolveVotd = vi.fn();
const mockFetchVerseText = vi.fn();

vi.mock('../../db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  eq: (...args: unknown[]) => args,
  first: (...args: unknown[]) => mockFirst(...args),
  FeaturedItems: { id: 'id', metadata: 'metadata' },
  UserMetadata: {
    userId: 'userId',
    timezone: 'timezone',
    lastReadPosition: 'lastReadPosition',
    defaultTranslation: 'defaultTranslation',
  },
}));

vi.mock('../votd-today-public', () => ({
  resolveVotdForLocalDate: (...args: unknown[]) => mockResolveVotd(...args),
}));

vi.mock('../fetch-verse-text', () => ({
  fetchVerseText: (...args: unknown[]) => mockFetchVerseText(...args),
}));

vi.mock('@/utils/last-read-position', () => ({
  parseLastReadPosition: () => null,
  lastReadPositionReference: () => '',
}));

import { buildReminderPayload, passageReaderUrl, TODAYS_PASSAGE_READER_URL } from '../reminder-payload';

function metadataRow(overrides: Record<string, string | null> = {}) {
  return {
    timezone: 'America/Chicago',
    lastReadPosition: null,
    defaultTranslation: 'ESV',
    ...overrides,
  };
}

describe('buildReminderPayload translation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirst.mockImplementation((rows: unknown) => (Array.isArray(rows) ? rows[0] : rows));
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [metadataRow()],
        }),
      }),
    });
    mockResolveVotd.mockResolvedValue({
      reference: 'John 3:16',
      translation: 'NET',
      featuredItemId: 'feat_1',
    });
    mockFetchVerseText.mockResolvedValue(
      '<p><sup class="verse-num">16</sup> For God so loved the world, that he gave his only Son.</p>',
    );
  });

  it('quotes the verse in the account default translation, not the catalog one', async () => {
    const built = await buildReminderPayload('user_1', { kind: 'daily' });

    expect(mockFetchVerseText).toHaveBeenCalledWith('John 3:16', 'ESV');
    expect(built.variant).toBe('verse');
    expect(built.payload.body).toContain('(ESV)');
    expect(built.payload.body).not.toContain('(NET)');
    expect(built.payload.body).toContain('For God so loved the world');
  });

  it('opens the reader on the quoted verse, in the translation it was quoted in', async () => {
    const built = await buildReminderPayload('user_1', { kind: 'daily' });
    expect(built.payload.data.url).toBe('/read/john/3?t=ESV&v=16');
  });

  it('falls back to catalog HTML when the preferred rendering is empty', async () => {
    mockFetchVerseText.mockResolvedValue('');
    mockSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [metadataRow()],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [
              { metadata: JSON.stringify({ verseText: '<p>Catalog NET wording.</p>' }) },
            ],
          }),
        }),
      });

    const built = await buildReminderPayload('user_1', { kind: 'daily' });
    expect(built.payload.body).toContain('Catalog NET wording');
    expect(built.payload.body).toContain('(ESV)');
  });
});

describe('passageReaderUrl', () => {
  it('lights a verse range inside one chapter', () => {
    expect(passageReaderUrl('1 John 4:7-8', 'NET')).toBe('/read/1-john/4?t=NET&v=7&vEnd=8');
  });

  it('lands on the first verse of a range that crosses chapters', () => {
    expect(passageReaderUrl('Romans 8:38-9:1', 'NET')).toBe('/read/romans/8?t=NET&v=38');
  });

  it('slugs multi-word books', () => {
    expect(passageReaderUrl('Song of Solomon 2:1', 'KJV')).toBe('/read/song-of-solomon/2?t=KJV&v=1');
  });

  it("falls back to the reader's today route for a reference it cannot parse", () => {
    expect(passageReaderUrl('not a reference', 'NET')).toBe(TODAYS_PASSAGE_READER_URL);
  });
});
