import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Each `db.select()` resolves to the next queued result set, whatever the chain. */
const selectResults: unknown[][] = [];
function chain(): unknown {
  const rows = selectResults.shift() ?? [];
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy', 'innerJoin', 'offset']) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  c.catch = (reject: (e: unknown) => unknown) => Promise.resolve(rows).catch(reject);
  return c;
}

vi.mock('../../db', () => {
  const table = new Proxy({}, { get: (_t, k) => String(k) });
  return {
    db: { select: () => chain() },
    Notes: table,
    ScriptureMetadata: table,
    StudyThreadEntries: table,
    UserMetadata: table,
    ReadingEvents: table,
    ...Object.fromEntries(
      ['eq', 'and', 'or', 'ne', 'not', 'isNull', 'isNotNull', 'desc', 'asc', 'inArray', 'notInArray', 'count', 'like', 'gt', 'gte', 'lt', 'lte'].map(
        (k) => [k, () => null],
      ),
    ),
    sql: Object.assign(() => null, { raw: () => null }),
    first: <T,>(rows: T[]) => rows[0],
  };
});

const requireSpaceAccess = vi.fn();
const sharedSpaceNoteAssociation = vi.fn();
const findSharedSpaceForNote = vi.fn();
const getTagNames = vi.fn();
const getThreadsForSpaceBySpaceId = vi.fn();
const getSpacesWithCounts = vi.fn();
const getMemberOfSpaces = vi.fn();

const { SpaceAccessError } = vi.hoisted(() => ({
  SpaceAccessError: class SpaceAccessError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock('../../utils/space-access', () => ({
  requireSpaceAccess: (...a: unknown[]) => requireSpaceAccess(...a),
  SpaceAccessError,
}));
vi.mock('../../utils/note-read-access', () => ({
  sharedSpaceNoteAssociation: (...a: unknown[]) => sharedSpaceNoteAssociation(...a),
  findSharedSpaceForNote: (...a: unknown[]) => findSharedSpaceForNote(...a),
}));
vi.mock('../../utils/dashboard-data', () => {
  return {
    // Same rule as the real helper: owners see every thread, members only the pinned one.
    visibleSharedThreadsForViewer: <T extends { isPinned: boolean }>(threads: T[], owner: boolean) =>
      owner ? threads : threads.filter((t) => t.isPinned),
    getTagNamesForNotesBatch: (...a: unknown[]) => getTagNames(...a),
    getThreadsForSpaceBySpaceId: (...a: unknown[]) => getThreadsForSpaceBySpaceId(...a),
    getThreadsForSpace: vi.fn(),
    getSpacesWithCounts: (...a: unknown[]) => getSpacesWithCounts(...a),
    getMemberOfSpaces: (...a: unknown[]) => getMemberOfSpaces(...a),
    getNotesForSpace: vi.fn(),
    getNotesForSharedSpace: vi.fn(),
    getNotesForThread: (...a: unknown[]) => getNotesForThread(...a),
    getNotesForThreadForMember: (...a: unknown[]) => getNotesForThreadForMember(...a),
  };
});
const getNotesForThread = vi.fn();
const getNotesForThreadForMember = vi.fn();
const requireThreadReadAccess = vi.fn();
const { SharedSpaceLifecycleError } = vi.hoisted(() => ({ SharedSpaceLifecycleError: class extends Error {} }));
vi.mock('../../utils/shared-space-lifecycle', () => ({
  requireThreadReadAccess: (...a: unknown[]) => requireThreadReadAccess(...a),
  SharedSpaceLifecycleError,
}));
const getPassageContext = vi.fn();
vi.mock('../../utils/scripture-knowledge', () => ({
  getPassageContext: (...a: unknown[]) => getPassageContext(...a),
}));
const getUserNoteVisitAggregate = vi.fn();
vi.mock('../../utils/record-note-visit', () => ({
  getUserNoteVisitAggregate: (...a: unknown[]) => getUserNoteVisitAggregate(...a),
}));
vi.mock('../../utils/record-reading-event', () => ({
  // One row per chapter already; the real collapse is tested with record-reading-event.
  collapseReadingHistory: (rows: Array<Record<string, unknown>>) => rows.map((r) => ({ ...r, lastReadAt: null })),
}));
vi.mock('../../utils/search-notes-query', () => ({ searchNoteRows: vi.fn(), classifySearchScope: vi.fn() }));
vi.mock('../../utils/space-study-threads', () => ({ listStudyThreadsForSpace: vi.fn() }));
vi.mock('../../utils/study-thread-space', () => ({ collectStudyThreadGraphForScope: vi.fn() }));
vi.mock('../../utils/study-thread-note-rows', () => ({ fetchStudyThreadNoteRows: vi.fn() }));
vi.mock('../../utils/shared-note-lookup', () => ({ findPublicSharedNoteByToken: vi.fn() }));
const findNotesCitingReference = vi.fn();
vi.mock('../../utils/notes-by-reference', () => ({
  findNotesCitingReference: (...a: unknown[]) => findNotesCitingReference(...a),
}));

const reads = await import('../read-service');

const ME = 'user_me';
const THEM = 'user_them';

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note_1',
    title: 'Romans 8',
    content: '<p>Nothing can separate us.</p>',
    noteType: 'default',
    contentEncrypted: false,
    userId: ME,
    spaceId: null,
    primaryCollection: 'Romans',
    secondaryCollections: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    ...overrides,
  };
}

/** Deep scan: no key anywhere in the result may name a person or carry Bible text. */
function forbiddenKeys(value: unknown, out: string[] = []): string[] {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/email|authorDisplayName|authorUserId|firstName|lastName|originalText|scripturePassageExcerpt|memberCount|churchName/i.test(k)) {
        out.push(k);
      }
      forbiddenKeys(v, out);
    }
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults.length = 0;
  getTagNames.mockResolvedValue(new Map([['note_1', ['hope']]]));
});

describe('get_note visibility', () => {
  it('returns your own note in full, with your folder and tags', async () => {
    selectResults.push([note()], []); // the note, then highlights
    const d = await reads.getNote(ME, { noteId: 'note_1' });
    expect(d).toMatchObject({ locked: false, byYou: true, folder: 'Romans', tags: ['hope'] });
    expect(forbiddenKeys(d)).toEqual([]);
  });

  it('returns your own locked note as metadata only', async () => {
    selectResults.push([note({ contentEncrypted: true, content: 'ciphertext' })]);
    const d = await reads.getNote(ME, { noteId: 'note_1' });
    expect(d).toMatchObject({ locked: true, title: 'Romans 8' });
    expect(JSON.stringify(d)).not.toContain('ciphertext');
  });

  it("hides someone else's locked note entirely", async () => {
    selectResults.push([note({ userId: THEM, contentEncrypted: true })]);
    await expect(reads.getNote(ME, { noteId: 'note_1' })).rejects.toMatchObject({ code: 'not_found' });
    expect(findSharedSpaceForNote).not.toHaveBeenCalled();
  });

  it("hides someone else's note you share no space with", async () => {
    selectResults.push([note({ userId: THEM })]);
    findSharedSpaceForNote.mockResolvedValue(null);
    await expect(reads.getNote(ME, { noteId: 'note_1' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it("shows a fellow member's note through the shared space, without their organization", async () => {
    selectResults.push([note({ userId: THEM })]);
    findSharedSpaceForNote.mockResolvedValue({ id: 'space_s', title: 'Tuesday group' });
    const d = await reads.getNote(ME, { noteId: 'note_1' });
    expect(d).toMatchObject({ locked: false, byYou: false, space: { id: 'space_s', title: 'Tuesday group' } });
    if (!d.locked) {
      expect(d.folder).toBeUndefined();
      expect(d.tags).toBeUndefined();
    }
    expect(getTagNames).not.toHaveBeenCalled();
    expect(forbiddenKeys(d)).toEqual([]);
  });

  it('refuses a space you are not in', async () => {
    selectResults.push([note()]);
    requireSpaceAccess.mockRejectedValue(new SpaceAccessError(403, 'nope'));
    await expect(reads.getNote(ME, { noteId: 'note_1', spaceId: 'space_x' })).rejects.toMatchObject({
      code: 'no_access',
    });
  });

  it('refuses a deleted space as not found', async () => {
    selectResults.push([note()]);
    requireSpaceAccess.mockRejectedValue(new SpaceAccessError(404, 'gone'));
    await expect(reads.getNote(ME, { noteId: 'note_1', spaceId: 'space_x' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses a note that is not associated with the named shared space', async () => {
    selectResults.push([note({ userId: THEM })]);
    requireSpaceAccess.mockResolvedValue({ space: { id: 'space_s', type: 'shared', title: 'G', userId: THEM } });
    sharedSpaceNoteAssociation.mockResolvedValue(null);
    await expect(reads.getNote(ME, { noteId: 'note_1', spaceId: 'space_s' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('normalizes bare note ids the way the app does', async () => {
    selectResults.push([]);
    await expect(reads.getNote(ME, { noteId: 'abc' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('lists', () => {
  it('shows a member only the current thread of a shared space', async () => {
    requireSpaceAccess.mockResolvedValue({ space: { id: 'space_s', type: 'shared', title: 'G', userId: THEM } });
    getThreadsForSpaceBySpaceId.mockResolvedValue([
      { id: 't1', title: 'This week', isPinned: true, noteCount: 3, subtitle: null, createdAt: new Date() },
      { id: 't2', title: 'Last week', isPinned: false, noteCount: 5, subtitle: null, createdAt: new Date() },
    ]);
    const r = await reads.listThreadsInSpace(ME, { spaceId: 'space_s', limit: 25 });
    expect(r.threads.map((t) => t.id)).toEqual(['t1']);
  });

  it('lists spaces without member counts or church names', async () => {
    getSpacesWithCounts.mockResolvedValue([
      { id: 'space_h', title: 'My Home', type: 'personal', memberCount: 1, churchName: null },
    ]);
    getMemberOfSpaces.mockResolvedValue([
      { id: 'space_s', title: 'Group', type: 'shared', role: 'member', memberCount: 9, churchName: 'Grace Church' },
    ]);
    const r = await reads.listSpaces(ME, { limit: 25 });
    expect(r.spaces[0]).toMatchObject({ id: 'space_h', isMyHome: true, role: 'owner' });
    expect(r.spaces[1]).toMatchObject({ id: 'space_s', role: 'member', kind: 'shared' });
    expect(forbiddenKeys(r)).toEqual([]);
  });
});

describe('share links', () => {
  it('accepts a full share URL or a bare token', () => {
    expect(reads.shareTokenFrom('https://app.harvous.com/shared/note/AbCdEf123456')).toBe('AbCdEf123456');
    expect(reads.shareTokenFrom('AbCdEf123456')).toBe('AbCdEf123456');
    expect(reads.shareTokenFrom('https://evil.example/x')).toBeNull();
  });
});

describe('find_by_passage', () => {
  const citing = (overrides: Record<string, unknown> = {}) => ({
    id: 'note_r8',
    title: 'Romans 8 study',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    content: '<p>No condemnation.</p>',
    contentEncrypted: false,
    references: ['Romans 8:28-30'],
    ...overrides,
  });

  it('returns notes that cite an overlapping range, with the references they cite', async () => {
    findNotesCitingReference.mockResolvedValue([citing()]);
    selectResults.push([]); // highlights
    const r = await reads.findByPassage(ME, { passage: 'romans 8', limit: 10 });
    expect(r.passage).toBe('Romans 8:1-39'); // canonical form of the whole chapter
    expect(findNotesCitingReference).toHaveBeenCalledWith(ME, 'Romans 8:1-39', 'Romans');
    expect(r.notes[0]).toMatchObject({ id: 'note_r8', locked: false, references: ['Romans 8:28-30'] });
    expect(r.notes[0].snippet).toContain('No condemnation');
  });

  it('shows a locked note as metadata only', async () => {
    findNotesCitingReference.mockResolvedValue([citing({ contentEncrypted: true, content: null })]);
    selectResults.push([]);
    const r = await reads.findByPassage(ME, { passage: 'Romans 8', limit: 10 });
    expect(r.notes[0]).toMatchObject({ locked: true, snippet: null });
  });

  it('includes overlapping highlights in the person’s own words, and drops ones outside the passage', async () => {
    findNotesCitingReference.mockResolvedValue([]);
    selectResults.push([
      { reference: 'Romans 8:28', translation: 'NET', miniNoteBody: 'Even this.', notesBody: '', parentNoteId: null, createdAt: new Date() },
      { reference: 'Romans 8:1', translation: 'NET', miniNoteBody: '', notesBody: '', parentNoteId: 'note_x', createdAt: new Date() },
      { reference: 'Romans 9:1', translation: 'NET', miniNoteBody: 'Not this chapter.', notesBody: '', parentNoteId: null, createdAt: new Date() },
    ]);
    const r = await reads.findByPassage(ME, { passage: 'Romans 8', limit: 10 });
    expect(r.highlights).toHaveLength(2);
    expect(r.highlights[0]).toMatchObject({ reference: 'Romans 8:28', kind: 'note', note: 'Even this.' });
    expect(r.highlights[1]).toMatchObject({ reference: 'Romans 8:1', kind: 'highlight', note: null, onNoteId: 'note_x' });
    expect(JSON.stringify(r)).not.toMatch(/scripturePassageExcerpt|sourceSnippet|anchorQuote/);
  });

  it('refuses something that is not a Bible reference, readably', async () => {
    await expect(reads.findByPassage(ME, { passage: 'grace and mercy', limit: 10 })).rejects.toMatchObject({
      code: 'bad_request',
      message: expect.stringContaining('Romans 8'),
    });
    expect(findNotesCitingReference).not.toHaveBeenCalled();
  });

  it('keeps highlights to the first page', async () => {
    findNotesCitingReference.mockResolvedValue(Array.from({ length: 30 }, (_, i) => citing({ id: `note_${i}` })));
    selectResults.push([]);
    const first = await reads.findByPassage(ME, { passage: 'Romans 8', limit: 10 });
    expect(first.nextCursor).toBeTruthy();
    const second = await reads.findByPassage(ME, { passage: 'Romans 8', limit: 10, cursor: first.nextCursor });
    expect(second.notes[0].id).toBe('note_10');
    expect(second.highlights).toEqual([]);
  });
});

describe('ChatGPT search / fetch', () => {
  it('routes a Bible reference to the passage lookup and words to full-text search, with app links', async () => {
    findNotesCitingReference.mockResolvedValue([
      { id: 'note_r8', title: 'Romans 8', updatedAt: new Date(), content: '<p>x</p>', contentEncrypted: false, references: ['Romans 8:28'] },
    ]);
    selectResults.push([]); // highlights
    const byRef = await reads.searchForResearch(ME, 'Romans 8');
    expect(byRef.results).toEqual([{ id: 'note_r8', title: 'Romans 8', url: 'https://app.harvous.com/note/note_r8' }]);
  });

  it('fetches a note as text with metadata and a link', async () => {
    selectResults.push([note()], []); // the note, then highlights
    const doc = await reads.fetchForResearch(ME, 'note_1');
    expect(doc).toMatchObject({ id: 'note_1', title: 'Romans 8', url: 'https://app.harvous.com/note/note_1' });
    expect(doc.text).toContain('Nothing can separate us');
    expect(doc.metadata).toMatchObject({ author: 'you', folder: 'Romans', tags: 'hope' });
  });

  it('fetches a locked note as its locked message only', async () => {
    selectResults.push([note({ contentEncrypted: true, content: 'ciphertext' })]);
    const doc = await reads.fetchForResearch(ME, 'note_1');
    expect(doc.metadata).toEqual({ locked: 'true' });
    expect(doc.text).not.toContain('ciphertext');
  });
});

describe('list_notes_in_thread', () => {
  it('lists a shared thread as a member sees it, dropping other members’ locked notes', async () => {
    requireThreadReadAccess.mockResolvedValue({ thread: { id: 'thread_r', title: 'Romans series', spaceId: 'space_g' } });
    requireSpaceAccess.mockResolvedValue({ space: { id: 'space_g', type: 'shared', title: 'Group' } });
    getNotesForThreadForMember.mockResolvedValue({
      notes: [
        note({ id: 'mine', authorUserId: ME }),
        note({ id: 'theirs_open', authorUserId: THEM }),
        note({ id: 'theirs_locked', authorUserId: THEM, contentEncrypted: true }),
      ],
      hasMore: false,
    });
    const out = await reads.listNotesInThread(ME, { threadId: 'thread_r', limit: 20 });
    expect(out.thread).toEqual({ id: 'thread_r', title: 'Romans series' });
    expect(out.notes.map((n) => n.id)).toEqual(['mine', 'theirs_open']);
    expect(getNotesForThread).not.toHaveBeenCalled();
  });

  it('refuses a thread the person cannot read', async () => {
    requireThreadReadAccess.mockRejectedValue(new SharedSpaceLifecycleError('nope'));
    await expect(reads.listNotesInThread(ME, { threadId: 'thread_x', limit: 20 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('passage_context', () => {
  it('returns names and references for the knowledge layer, and never verse text', async () => {
    getPassageContext.mockResolvedValue({
      themes: [{ topicId: 't', slug: 'hope', label: 'Hope', relevance: 1 }],
      crossReferences: [
        { book: 'Genesis', chapterStart: 50, chapterEnd: 50, verseStart: 20, verseEnd: 20, votes: 9 },
        { book: 'Exodus', chapterStart: 6, chapterEnd: 7, verseStart: 28, verseEnd: 7, votes: 3 },
      ],
      people: [{ id: 'p', slug: 'paul', name: 'Paul' }],
      places: [{ id: 'r', slug: 'rome', name: 'Rome' }],
      relatedNotes: [{ noteId: 'note_9', title: 'Suffering', reason: 'Cross-reference' }],
    });
    const out = await reads.passageContext(ME, { passage: 'romans 8:28' });
    expect(out).toEqual({
      passage: 'Romans 8:28',
      themes: ['Hope'],
      crossReferences: ['Genesis 50:20', 'Exodus 6:28-7:7'],
      people: ['Paul'],
      places: ['Rome'],
      yourRelatedNotes: [{ id: 'note_9', title: 'Suffering', reason: 'Cross-reference', url: 'https://app.harvous.com/note/note_9' }],
    });
    expect(getPassageContext).toHaveBeenCalledWith(ME, [{ book: 'Romans', chapter: 8, verse: 28 }], { relatedLimit: 8 });
    expect(JSON.stringify(out)).not.toMatch(/"(text|verseText|html)"/);
  });

  it('refuses something that is not a reference', async () => {
    await expect(reads.passageContext(ME, { passage: 'grace' })).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe('where_i_left_off', () => {
  it('picks the note most recently worked with, edited or read, and the chapter to keep reading', async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 9, n));
    getUserNoteVisitAggregate.mockResolvedValue([{ noteId: 'note_read', count: 2, lastVisitedAt: day(5).toISOString() }]);
    selectResults.push(
      [note({ id: 'note_edit', updatedAt: day(3), createdAt: day(1) }), note({ id: 'note_read', updatedAt: day(1), createdAt: day(1) })],
      [{ lastReadPosition: JSON.stringify({ book: 'Romans', bookOrder: 44, chapter: 8, translation: 'NET', readAt: day(5).toISOString() }) }],
      [{ book: 'Romans', bookOrder: 44, chapter: 8, dwellBucket: 'read', createdAt: day(5) }],
    );
    const out = await reads.whereILeftOff(ME);
    expect(out.continueNote?.id).toBe('note_read');
    expect(out.continueNote?.url).toBe('https://app.harvous.com/note/note_read');
    expect(out.continueReading).toMatchObject({ reference: 'Romans 9', reason: 'next' });
    expect(out.recentNotes.map((n) => n.id)).toEqual(['note_edit']);
  });
});
