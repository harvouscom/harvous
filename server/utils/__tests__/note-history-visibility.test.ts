import { describe, expect, it } from 'vitest';
import {
  NOTE_HISTORY_PAGE_DEFAULT,
  NOTE_HISTORY_PAGE_MAX,
  NOTE_HISTORY_RAW_PAGE_MAX,
  buildNoteHistoryRawPage,
  buildNoteHistorySessionsPage,
  historyVisibleSince,
  isReplacedBeforeWindow,
  parseNoteHistoryQuery,
  type NoteHistoryRow,
} from '../note-history-visibility';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const NOW = new Date('2026-09-13T12:00:00Z');
const SINCE = historyVisibleSince(NOW, false)!;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function row(version: number, createdAt: Date, overrides: Partial<NoteHistoryRow> = {}): NoteHistoryRow {
  return {
    id: `v${version}`,
    version,
    title: `Title ${version}`,
    contentEncrypted: false,
    source: 'save',
    createdAt,
    editedBy: null,
    authorId: 'user_a',
    ...overrides,
  };
}

const sessionsPage = (
  rowsNewestFirst: NoteHistoryRow[],
  overrides: Partial<Parameters<typeof buildNoteHistorySessionsPage>[0]> = {},
) =>
  buildNoteHistorySessionsPage({
    rowsNewestFirst,
    scanLimitReached: false,
    successorCreatedAt: null,
    currentVersionId: rowsNewestFirst[0]?.id ?? null,
    since: SINCE,
    limit: 30,
    ...overrides,
  });

describe('history window', () => {
  it('gives free accounts 90 days and Plus no window', () => {
    expect(NOW.getTime() - SINCE.getTime()).toBe(90 * DAY);
    expect(historyVisibleSince(NOW, true)).toBeNull();
  });

  it('locks only a version replaced before the window opened', () => {
    expect(isReplacedBeforeWindow(ago(91 * DAY), SINCE)).toBe(true);
    expect(isReplacedBeforeWindow(SINCE, SINCE)).toBe(false);
    expect(isReplacedBeforeWindow(null, SINCE)).toBe(false);
    expect(isReplacedBeforeWindow(ago(400 * DAY), null)).toBe(false);
  });
});

describe('buildNoteHistorySessionsPage', () => {
  it('groups autosaves into sessions, newest first, each shown by its last checkpoint', () => {
    const t = ago(DAY).getTime();
    const at = (minutes: number) => new Date(t + minutes * MIN);
    const page = sessionsPage([row(6, at(61)), row(5, at(60)), row(4, at(2)), row(3, at(1)), row(2, at(0))]);
    expect(page.sessions.map((s) => [s.id, s.startVersion, s.versionCount, s.isCurrent])).toEqual([
      ['v6', 5, 2, true],
      ['v4', 2, 3, false],
    ]);
    expect(page).toMatchObject({ nextCursor: null, locked: null });
  });

  it('keeps how an old note looked this morning visible to a free account', () => {
    const page = sessionsPage([row(3, ago(60 * MIN)), row(2, ago(365 * DAY)), row(1, ago(400 * DAY))]);
    expect(page.sessions.map((s) => s.id)).toEqual(['v3', 'v2']);
    expect(page.locked).toEqual({ before: SINCE.toISOString() });
    expect(page.nextCursor).toBeNull();
  });

  it('shows every session when there is no window', () => {
    const page = sessionsPage([row(3, ago(60 * MIN)), row(2, ago(365 * DAY)), row(1, ago(400 * DAY))], {
      since: null,
    });
    expect(page.sessions.map((s) => s.id)).toEqual(['v3', 'v2', 'v1']);
    expect(page.locked).toBeNull();
  });

  it('always shows the current version, however old', () => {
    const page = sessionsPage([row(2, ago(200 * DAY)), row(1, ago(300 * DAY))]);
    expect(page.sessions.map((s) => s.id)).toEqual(['v2']);
    expect(page.locked).not.toBeNull();
  });

  it('pages by session and hands back the oldest version of the last one as the cursor', () => {
    const page = sessionsPage([row(5, ago(DAY)), row(4, ago(2 * DAY)), row(3, ago(3 * DAY) ), row(2, ago(3 * DAY + MIN))], {
      limit: 2,
    });
    expect(page.sessions.map((s) => s.id)).toEqual(['v5', 'v4']);
    expect(page.nextCursor).toBe(4);
  });

  it('leaves a session that may continue past the scan for the next page', () => {
    const page = sessionsPage([row(5, ago(DAY)), row(4, ago(2 * DAY)), row(3, ago(2 * DAY + MIN))], {
      scanLimitReached: true,
    });
    expect(page.sessions.map((s) => s.id)).toEqual(['v5']);
    expect(page.nextCursor).toBe(5);
  });

  it('dates the first session on a later page by the version above the cursor', () => {
    const rows = [row(2, ago(100 * DAY))];
    expect(sessionsPage(rows, { currentVersionId: 'v9', successorCreatedAt: ago(95 * DAY) }).locked).not.toBeNull();
    expect(sessionsPage(rows, { currentVersionId: 'v9', successorCreatedAt: ago(80 * DAY) }).sessions).toHaveLength(1);
  });

  it('starts a new session when someone else edits', () => {
    const t = ago(DAY).getTime();
    const page = sessionsPage([
      row(3, new Date(t + 2 * MIN), { editedBy: 'user_b' }),
      row(2, new Date(t + MIN)),
      row(1, new Date(t)),
    ]);
    expect(page.sessions.map((s) => [s.id, s.editorUserId])).toEqual([
      ['v3', 'user_b'],
      ['v2', 'user_a'],
    ]);
  });
});

describe('buildNoteHistoryRawPage', () => {
  it('lists every row individually, stopping at the window', () => {
    const page = buildNoteHistoryRawPage({
      rowsNewestFirst: [row(3, ago(DAY)), row(2, ago(200 * DAY)), row(1, ago(300 * DAY))],
      successorCreatedAt: null,
      currentVersionId: 'v3',
      since: ago(10 * DAY),
      limit: 10,
    });
    expect(page.versions.map((v) => v.id)).toEqual(['v3', 'v2']);
    expect(page.locked).toEqual({ before: ago(10 * DAY).toISOString() });
  });

  it('pages by version when a row past the limit was fetched', () => {
    const page = buildNoteHistoryRawPage({
      rowsNewestFirst: [row(3, ago(MIN)), row(2, ago(2 * MIN)), row(1, ago(3 * MIN))],
      successorCreatedAt: null,
      currentVersionId: 'v3',
      since: null,
      limit: 2,
    });
    expect(page.versions.map((v) => v.id)).toEqual(['v3', 'v2']);
    expect(page.nextCursor).toBe(2);
  });
});

describe('parseNoteHistoryQuery', () => {
  it('defaults to the first page of sessions', () => {
    expect(parseNoteHistoryQuery({})).toEqual({ before: null, limit: NOTE_HISTORY_PAGE_DEFAULT, raw: false });
  });

  it('caps the page size by mode and ignores nonsense', () => {
    expect(parseNoteHistoryQuery({ limit: '999' }).limit).toBe(NOTE_HISTORY_PAGE_MAX);
    expect(parseNoteHistoryQuery({ limit: '999', raw: '1' }).limit).toBe(NOTE_HISTORY_RAW_PAGE_MAX);
    expect(parseNoteHistoryQuery({ before: '-3', limit: 'x' })).toEqual({
      before: null,
      limit: NOTE_HISTORY_PAGE_DEFAULT,
      raw: false,
    });
    expect(parseNoteHistoryQuery({ before: '42' }).before).toBe(42);
  });
});
