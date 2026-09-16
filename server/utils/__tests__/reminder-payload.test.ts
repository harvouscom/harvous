/**
 * Reminder copy follows the account's default translation, and a verse reminder opens
 * Activity on today's passage rather than the catalog reader URL.
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

import { buildReminderPayload, TODAYS_PASSAGE_FOCUS } from '../reminder-payload';

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

  it("opens Activity focused on today's passage so the row is actually on the sheet", async () => {
    const built = await buildReminderPayload('user_1', { kind: 'daily' });
    expect(built.payload.data.url).toBe(`/?focus=${TODAYS_PASSAGE_FOCUS}`);
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
