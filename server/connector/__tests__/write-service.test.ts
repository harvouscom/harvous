import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
const updates: string[] = [];
let metadataRows: unknown[] = [{ id: 'user_metadata_u', highestSimpleNoteId: 7 }];

function query(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'for']) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return c;
}
const writer = {
  select: () => query(metadataRows),
  insert: (table: string) => ({
    values: (values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return Promise.resolve();
    },
  }),
  update: (table: string) => {
    updates.push(table);
    const c = { set: () => c, where: () => Object.assign(Promise.resolve(), { catch: () => Promise.resolve() }) };
    return c;
  },
};

vi.mock('../../db', () => {
  const table = (name: string) => new Proxy({ name }, { get: (t, k) => (k === 'toString' ? () => name : String(k)) });
  return {
    db: { ...writer, transaction: (fn: (tx: typeof writer) => Promise<unknown>) => fn(writer) },
    Notes: 'Notes',
    UserMetadata: table('UserMetadata'),
    Threads: 'Threads',
    NoteChatOrigins: 'NoteChatOrigins',
    eq: () => null,
    and: () => null,
    first: <T,>(rows: T[]) => rows[0],
  };
});
vi.mock('../../utils/unorganized-thread', () => ({ ensureUnorganizedThread: vi.fn(async () => ({})) }));
vi.mock('../../utils/highest-simple-note-id', () => ({ getEffectiveHighestSimpleNoteId: vi.fn(async () => 9) }));
const createInitialNoteVersion = vi.fn(async () => ({ id: 'v1' }));
vi.mock('../../utils/note-version-service', () => ({ createInitialNoteVersion: (...a: unknown[]) => createInitialNoteVersion(...(a as [])) }));
vi.mock('../../utils/broadcast-shared-space-note', () => ({ broadcastCanonicalNoteInvalidation: vi.fn(async () => {}) }));
const allowsStartNotes = vi.fn(async () => true);
vi.mock('../preferences', () => ({ allowsStartNotes: (...a: unknown[]) => allowsStartNotes(...(a as [])) }));
const consumeNoteStart = vi.fn(async () => ({ today: 1 }));
const connectorClientName = vi.fn(async () => 'Anthropic/ClaudeAI');
vi.mock('../usage', () => ({
  consumeNoteStart: (...a: unknown[]) => consumeNoteStart(...(a as [])),
  connectorClientName: (...a: unknown[]) => connectorClientName(...(a as [])),
}));
const tryConsumeNoteCreates = vi.fn((): { allowed: boolean; error?: string } => ({ allowed: true }));
vi.mock('@/utils/rate-limit', () => ({ tryConsumeNoteCreates: (...a: unknown[]) => tryConsumeNoteCreates(...(a as [])) }));

const { startNote, noteTitleFrom, canonicalPassages } = await import('../write-service');
const { ConnectorRefusal } = await import('../shapes');

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  metadataRows = [{ id: 'user_metadata_u', highestSimpleNoteId: 7 }];
  vi.clearAllMocks();
  allowsStartNotes.mockResolvedValue(true);
  tryConsumeNoteCreates.mockReturnValue({ allowed: true });
});

const input = {
  title: 'Romans 8:28 and my own mess',
  summary: 'You asked whether Romans 8:28 covers trouble you brought on yourself.',
  passages: ['romans 8:28-29', 'Genesis 50:20', 'Hezekiah 3:4', 'Genesis 50:20'],
  question: 'Does “for good” mean good for me?',
};

describe('start_note', () => {
  it('starts one empty note in My Home, stamped with the app, with the card beside it', async () => {
    const started = await startNote('u', 'client_1', input);
    expect(started).toMatchObject({
      title: 'Romans 8:28 and my own mess',
      app: 'Claude',
      passages: ['Romans 8:28-29', 'Genesis 50:20'],
      droppedPassages: ['Hezekiah 3:4'],
    });
    expect(started.url).toBe(`https://app.harvous.com/note/${started.noteId}`);

    const note = inserts.find((i) => i.table === 'Notes')!.values;
    expect(note).toMatchObject({
      content: '',
      threadId: 'thread_unorganized',
      spaceId: null,
      simpleNoteId: 10,
      addedBy: 'mcp-claude',
      userId: 'u',
      isPublic: false,
    });
    const card = inserts.find((i) => i.table === 'NoteChatOrigins')!.values;
    expect(card).toMatchObject({ noteId: started.noteId, appName: 'Claude', summary: input.summary, question: input.question });
    expect(JSON.parse(card.passages as string)).toEqual(['Romans 8:28-29', 'Genesis 50:20']);
    expect(createInitialNoteVersion).toHaveBeenCalledWith(writer, expect.objectContaining({ source: 'mcp', content: { title: started.title, content: '', contentEncrypted: false } }));
    expect(inserts.map((i) => i.table).sort()).toEqual(['NoteChatOrigins', 'Notes']);
  });

  it('is refused, writing nothing, when the person turned it off', async () => {
    allowsStartNotes.mockResolvedValue(false);
    await expect(startNote('u', 'c', input)).rejects.toMatchObject({ code: 'turned_off' });
    expect(consumeNoteStart).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it('is refused, writing nothing, past the daily cap', async () => {
    consumeNoteStart.mockRejectedValueOnce(new ConnectorRefusal('daily_limit', 'limit'));
    await expect(startNote('u', 'c', input)).rejects.toMatchObject({ code: 'daily_limit' });
    expect(inserts).toEqual([]);
  });

  it('respects the app-wide note-create rate limit', async () => {
    tryConsumeNoteCreates.mockReturnValue({ allowed: false, error: 'Too many notes created too quickly.' });
    await expect(startNote('u', 'c', input)).rejects.toMatchObject({ code: 'rate_limited' });
    expect(inserts).toEqual([]);
  });
});

describe('start_note inputs', () => {
  it('trims a long title to the app’s 50 characters at a word', () => {
    const title = noteTitleFrom('what paul means by all things working together for good in romans eight');
    expect(title.length).toBeLessThanOrEqual(50);
    expect(title).toBe('What paul means by all things working together');
  });

  it('keeps readable references once each, caps at ten, and reports the rest', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Psalm ${i + 1}`);
    expect(canonicalPassages(many).passages).toHaveLength(10);
    expect(canonicalPassages(['John 3:16', 'john 3:16', 'not a verse'])).toEqual({ passages: ['John 3:16'], dropped: ['not a verse'] });
  });
});
